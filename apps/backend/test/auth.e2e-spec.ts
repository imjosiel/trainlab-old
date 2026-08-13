import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { encode } from 'next-auth/jwt';
import request from 'supertest';

import { CurrentUser } from '@/auth/current-user.decorator';
import { ErrorContractFilter } from '@/common/error-contract.filter';
import { NextAuthJwtGuard } from '@/auth/next-auth-jwt.guard';
import { Public } from '@/auth/public.decorator';
import { SessionPayload } from '@/auth/session-payload';
import { MeController } from '@/auth/me.controller';
import { HealthController } from '@/health/health.controller';

const SECRET = 'e2e-secret-nao-usado-em-producao';

/** Rota protegida: só existe para provar o guard pelo stack HTTP real. */
@Controller('protegida')
class ProtectedController {
  @Get()
  handle(@CurrentUser() user?: SessionPayload) {
    return { user: user ?? null };
  }
}

@Controller('aberta')
class PublicController {
  @Public()
  @Get()
  handle(@CurrentUser() user?: SessionPayload) {
    return { user: user ?? null };
  }
}

/**
 * Cunha um token do mesmo jeito que o NextAuth cunha — `encode`/`decode` são o
 * par usado internamente por ele, então isto exercita a criptografia real
 * (JWE), não uma simulação.
 */
function mintToken(claims: Record<string, unknown>): Promise<string> {
  return encode({ token: claims, secret: SECRET });
}

describe('Ponte de autenticação NextAuth → Nest (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NEXTAUTH_SECRET = SECRET;

    const moduleRef = await Test.createTestingModule({
      controllers: [ProtectedController, PublicController, HealthController, MeController],
      providers: [
        { provide: APP_GUARD, useClass: NextAuthJwtGuard },
        { provide: APP_FILTER, useClass: ErrorContractFilter },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('default-deny (D2)', () => {
    // Propriedade 1
    it('nega rota protegida sem token', async () => {
      const res = await request(app.getHttpServer()).get('/protegida');
      expect(res.status).toBe(401);
    });

    // Propriedade 11 — o corpo real na resposta HTTP, não só a exception.
    it('o corpo do 401 é { error: "Não autorizado" }', async () => {
      const res = await request(app.getHttpServer()).get('/protegida');
      expect(res.body).toEqual({ error: 'Não autorizado' });
      // Prova que não é o corpo padrão do Nest (D5).
      expect(res.body).not.toHaveProperty('statusCode');
      expect(res.body).not.toHaveProperty('message');
    });

    // Propriedade 2
    it.each([
      ['sem prefixo Bearer', 'abc.def.ghi'],
      ['Bearer sem token', 'Bearer '],
      ['esquema errado', 'Basic dXNlcjpwYXNz'],
    ])('nega header malformado: %s', async (_label, header) => {
      const res = await request(app.getHttpServer())
        .get('/protegida')
        .set('Authorization', header);
      expect(res.status).toBe(401);
    });

    // Propriedade 3 — token real, mas cunhado com OUTRO secret.
    it('nega token assinado com outro secret', async () => {
      const alheio = await encode({
        token: { id: 'user_1' },
        secret: 'um-secret-completamente-diferente',
      });
      const res = await request(app.getHttpServer())
        .get('/protegida')
        .set('Authorization', `Bearer ${alheio}`);
      expect(res.status).toBe(401);
    });

    it('nega token com o texto corrompido', async () => {
      const token = await mintToken({ id: 'user_1' });
      const res = await request(app.getHttpServer())
        .get('/protegida')
        .set('Authorization', `Bearer ${token.slice(0, -6)}xxxxxx`);
      expect(res.status).toBe(401);
    });

    // Propriedade 4
    it('nega token válido que não carrega id', async () => {
      const token = await mintToken({ roles: ['ADMIN'], systemRoles: ['ADMIN'] });
      const res = await request(app.getHttpServer())
        .get('/protegida')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    });
  });

  describe('token válido (D3)', () => {
    // Propriedade 5
    it('aceita e entrega o SessionPayload completo ao handler', async () => {
      const token = await mintToken({
        id: 'user_1',
        name: 'Josiel',
        email: 'josiel@example.com',
        picture: 'https://img/a.png',
        roles: ['PROFESSIONAL'],
        systemRoles: ['USER'],
        subscriptionStatus: 'active',
        subscriptionPlan: 'premium',
        stripeCustomerId: 'cus_123',
      });

      const res = await request(app.getHttpServer())
        .get('/protegida')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.user).toEqual({
        id: 'user_1',
        name: 'Josiel',
        email: 'josiel@example.com',
        image: 'https://img/a.png',
        roles: ['PROFESSIONAL'],
        systemRoles: ['USER'],
        isAdmin: false,
        subscriptionStatus: 'active',
        subscriptionPlan: 'premium',
        stripeCustomerId: 'cus_123',
      });
    });

    // Propriedade 8
    it('isAdmin true para ADMIN e para MODERATOR', async () => {
      for (const role of ['ADMIN', 'MODERATOR']) {
        const token = await mintToken({ id: 'u', systemRoles: [role] });
        const res = await request(app.getHttpServer())
          .get('/protegida')
          .set('Authorization', `Bearer ${token}`);
        expect(res.body.user.isAdmin).toBe(true);
      }
    });

    // Propriedade 9 — atravessando o stack real, um token que se autodeclara
    // admin não vira admin.
    it('não promove um token que carrega isAdmin: true', async () => {
      const token = await mintToken({
        id: 'u',
        systemRoles: ['USER'],
        isAdmin: true,
      });
      const res = await request(app.getHttpServer())
        .get('/protegida')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.user.isAdmin).toBe(false);
    });

    // Propriedade 10
    it('aplica os fallbacks PENDING/USER quando o token não traz roles', async () => {
      const token = await mintToken({ id: 'u' });
      const res = await request(app.getHttpServer())
        .get('/protegida')
        .set('Authorization', `Bearer ${token}`);
      expect(res.body.user.roles).toEqual(['PENDING']);
      expect(res.body.user.systemRoles).toEqual(['USER']);
    });
  });

  describe('rotas públicas (D2)', () => {
    // Propriedade 6
    it('libera sem token e não inventa user', async () => {
      const res = await request(app.getHttpServer()).get('/aberta');
      expect(res.status).toBe(200);
      expect(res.body.user).toBeNull();
    });

    // Propriedade 7
    it('com token válido, popula user mesmo sendo pública', async () => {
      const token = await mintToken({ id: 'user_9', systemRoles: ['ADMIN'] });
      const res = await request(app.getHttpServer())
        .get('/aberta')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({ id: 'user_9', isAdmin: true });
    });

    it('com token inválido, libera sem user em vez de negar', async () => {
      const res = await request(app.getHttpServer())
        .get('/aberta')
        .set('Authorization', 'Bearer lixo-que-nao-decodifica');
      expect(res.status).toBe(200);
      expect(res.body.user).toBeNull();
    });

    it('/health responde sem autenticação', async () => {
      const res = await request(app.getHttpServer()).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });

  /**
   * O 404 do router acontece ANTES de qualquer guard, então este é o único
   * caminho de erro que não passa por código nosso — e por isso o que mais
   * facilmente escapa do contrato `{ error }`.
   */
  describe('contrato de erro em caminho inexistente', () => {
    it('GET / devolve { error } em português, não o corpo padrão do Nest', async () => {
      const res = await request(app.getHttpServer()).get('/');

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Recurso não encontrado' });
      expect(res.body).not.toHaveProperty('statusCode');
      expect(res.body).not.toHaveProperty('message');
      expect(JSON.stringify(res.body)).not.toContain('Cannot GET');
      expect(JSON.stringify(res.body)).not.toContain('Not Found');
    });

    it('caminho fundo inexistente também', async () => {
      const res = await request(app.getHttpServer()).get('/nao/existe/nada');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Recurso não encontrado' });
    });

    it('verbo não mapeado numa rota existente também', async () => {
      const res = await request(app.getHttpServer()).post('/health');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Recurso não encontrado' });
    });
  });

  describe('GET /me — a ponte observável', () => {
    it('exige sessão', async () => {
      const res = await request(app.getHttpServer()).get('/me');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Não autorizado' });
    });

    it('devolve o payload da sessão do portador do token', async () => {
      const token = await mintToken({
        id: 'user_7',
        name: 'Josiel',
        email: 'josiel@example.com',
        roles: ['PROFESSIONAL', 'PARTNER_B2B'],
        systemRoles: ['ADMIN'],
        subscriptionStatus: 'active',
        subscriptionPlan: 'premium',
        stripeCustomerId: 'cus_9',
      });

      const res = await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: 'user_7',
        name: 'Josiel',
        email: 'josiel@example.com',
        image: null,
        roles: ['PROFESSIONAL', 'PARTNER_B2B'],
        systemRoles: ['ADMIN'],
        isAdmin: true,
        subscriptionStatus: 'active',
        subscriptionPlan: 'premium',
        stripeCustomerId: 'cus_9',
      });
    });
  });
});
