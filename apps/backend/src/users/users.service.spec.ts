import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';

import { NEVER_PUBLIC } from './public-profile.select';
import { UsersService } from './users.service';

function prismaMock() {
  return { user: { findFirst: jest.fn() } };
}

type PrismaMock = ReturnType<typeof prismaMock>;

async function bodyOfRejection(promise: Promise<unknown>): Promise<Record<string, unknown>> {
  try {
    await promise;
    throw new Error('esperava rejeição, mas resolveu');
  } catch (err) {
    if (!(err instanceof HttpException)) throw err;
    return err.getResponse() as Record<string, unknown>;
  }
}

/**
 * LIMITE DESTE ARQUIVO, e a razão de ele ter duas fixtures.
 *
 * Quem filtra campo é o `select` do Prisma, e o mock ignora `select` — ele
 * devolve o que foi mandado devolver. Então aqui NÃO se prova que o campo
 * sensível não sai; prova-se que o service **não o pede**. O que efetivamente
 * volta pela consulta real é afirmado no e2e, contra o Postgres.
 *
 * `LINHA_COMPLETA` serve às asserções sobre a CONSULTA (o mock só precisa
 * resolver com algo). `LINHA_SELECIONADA` é o que o banco realmente devolveria
 * com este select, e serve às asserções sobre a RESPOSTA — que aqui cobrem só o
 * pós-processamento do service (remover `isPublic`, montar o envelope).
 */
const LINHA_COMPLETA = {
  id: 'user-1',
  email: 'privado@example.com',
  name: 'Josiel',
  username: 'josiel',
  image: null,
  bio: 'Atleta',
  roles: ['INDIVIDUAL'],
  systemRoles: ['USER'],
  isPublic: true,
  createdAt: new Date('2026-01-01'),
  phone: '+5511999999999',
  athleteProfiles: [
    {
      id: 'prof-1',
      userId: 'user-1',
      studentId: null,
      sportId: 'sport-1',
      position: 'Atacante',
      technicalLevel: 'avancado',
      yearsPlaying: 10,
      dateOfBirth: new Date('1995-03-14'),
      height: 178,
      weight: 74,
      injuryHistory: 'Ruptura de LCA',
      currentInjuries: 'Tendinite',
      hasHealthIssues: true,
      healthIssuesDesc: 'Asma',
      takesMedication: true,
      medicationDesc: 'Salbutamol',
      goals: 'Competir',
      strengths: 'Velocidade',
      weaknesses: 'Medo',
      acceptedTerms: true,
      sport: { name: 'Futebol', slug: 'soccer' },
      teams: [{ name: 'Time A' }],
    },
  ],
};

/** O que o Postgres realmente devolve com o PUBLIC_PROFILE_SELECT. */
const LINHA_SELECIONADA = {
  name: 'Josiel',
  username: 'josiel',
  image: null,
  bio: 'Atleta',
  roles: ['INDIVIDUAL'],
  isPublic: true,
  createdAt: new Date('2026-01-01'),
  athleteProfiles: [
    {
      position: 'Atacante',
      technicalLevel: 'avancado',
      yearsPlaying: 10,
      sport: { name: 'Futebol', slug: 'soccer' },
      teams: [{ name: 'Time A' }],
    },
  ],
};

describe('UsersService.findPublicProfile', () => {
  let prisma: PrismaMock;
  let service: UsersService;

  beforeEach(() => {
    prisma = prismaMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats: any = { compute: jest.fn().mockResolvedValue({ completionRate: 0, streak: 0 }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new UsersService(prisma as any, stats);
  });

  describe('exposição (propriedades 1–5) — o núcleo', () => {
    /**
     * A consulta pede `select`, não `include`. É o que garante que coluna nova
     * no schema não entre na resposta sem alguém decidir — foi exatamente o
     * `include` que produziu o vazamento A9.
     */
    it('a consulta usa select, e em nenhum nível usa include', () => {
      prisma.user.findFirst.mockResolvedValue(LINHA_COMPLETA);
      void service.findPublicProfile('josiel');

      const arg = prisma.user.findFirst.mock.calls[0][0];
      expect(arg.select).toBeDefined();
      expect(JSON.stringify(arg)).not.toContain('include');
    });

    it('não pede nenhum campo da lista proibida ao banco', async () => {
      prisma.user.findFirst.mockResolvedValue(LINHA_COMPLETA);
      await service.findPublicProfile('josiel');

      const pedido = JSON.stringify(prisma.user.findFirst.mock.calls[0][0].select);
      for (const campo of NEVER_PUBLIC) {
        expect(pedido).not.toContain(`"${campo}"`);
      }
    });

    /**
     * Propriedade 1 — a lista proibida é conferida contra o SELECT, que é onde
     * ela é decidível com mock. A conferência contra a resposta real está no
     * e2e. Afirmação por lista, não por igualdade: campo sensível acrescentado
     * ao schema no futuro quebra este teste em vez de passar calado.
     */
    it('nenhum campo proibido é sequer solicitado, em nenhum nível do select', () => {
      prisma.user.findFirst.mockResolvedValue(LINHA_COMPLETA);
      void service.findPublicProfile('josiel');

      const select = JSON.stringify(prisma.user.findFirst.mock.calls[0][0].select);
      for (const campo of NEVER_PUBLIC) {
        expect(select).not.toContain(campo);
      }
    });

    // Propriedade 3
    it('remove isPublic da resposta — foi lido só para decidir o 404', async () => {
      prisma.user.findFirst.mockResolvedValue(LINHA_SELECIONADA);
      const { user } = await service.findPublicProfile('josiel');

      expect(user).not.toHaveProperty('isPublic');
      expect(user).not.toHaveProperty('id');
    });

    // Propriedade 2
    it('devolve exatamente os campos acordados', async () => {
      prisma.user.findFirst.mockResolvedValue(LINHA_SELECIONADA);
      const { user } = await service.findPublicProfile('josiel');

      expect(Object.keys(user).sort()).toEqual(
        ['athleteProfiles', 'bio', 'createdAt', 'image', 'name', 'roles', 'username'].sort(),
      );
    });

    // Propriedade 5
    it('o perfil traz só posição, nível, anos, esporte e times', async () => {
      prisma.user.findFirst.mockResolvedValue(LINHA_SELECIONADA);
      const { user } = await service.findPublicProfile('josiel');

      expect(Object.keys(user.athleteProfiles[0]).sort()).toEqual(
        ['position', 'sport', 'teams', 'technicalLevel', 'yearsPlaying'].sort(),
      );
      expect(user.athleteProfiles[0].sport).toEqual({ name: 'Futebol', slug: 'soccer' });
      expect(user.athleteProfiles[0].teams).toEqual([{ name: 'Time A' }]);
    });

    it('o envelope é { user }, como no legado', async () => {
      prisma.user.findFirst.mockResolvedValue(LINHA_SELECIONADA);
      const res = await service.findPublicProfile('josiel');
      expect(Object.keys(res)).toEqual(['user']);
    });
  });

  describe('visibilidade (propriedades 6–8)', () => {
    it('isPublic false → 404', async () => {
      prisma.user.findFirst.mockResolvedValue({ ...LINHA_COMPLETA, isPublic: false });
      await expect(service.findPublicProfile('josiel')).rejects.toThrow(NotFoundException);
    });

    it('username inexistente → 404', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.findPublicProfile('ninguem')).rejects.toThrow(NotFoundException);
    });

    // Propriedade 7 — a indistinguibilidade é a propriedade (D24).
    it('perfil privado e usuário inexistente devolvem a MESMA resposta', async () => {
      prisma.user.findFirst.mockResolvedValue({ ...LINHA_COMPLETA, isPublic: false });
      const privado = await bodyOfRejection(service.findPublicProfile('josiel'));

      prisma.user.findFirst.mockResolvedValue(null);
      const inexistente = await bodyOfRejection(service.findPublicProfile('ninguem'));

      expect(privado).toEqual(inexistente);
      expect(privado.error).toBe('Usuário não encontrado.');
    });

    // Propriedade 8
    it('usuário sem perfil de atleta devolve lista vazia, não erro', async () => {
      prisma.user.findFirst.mockResolvedValue({ ...LINHA_COMPLETA, athleteProfiles: [] });
      const { user } = await service.findPublicProfile('josiel');
      expect(user.athleteProfiles).toEqual([]);
    });
  });

  describe('busca (propriedades 9 e 10)', () => {
    it('casa username ignorando capitalização', async () => {
      prisma.user.findFirst.mockResolvedValue(LINHA_COMPLETA);
      await service.findPublicProfile('JoSiEl');

      expect(prisma.user.findFirst.mock.calls[0][0].where).toEqual({
        username: { equals: 'JoSiEl', mode: 'insensitive' },
      });
    });

    it('decodifica username percent-encoded', async () => {
      prisma.user.findFirst.mockResolvedValue(LINHA_COMPLETA);
      await service.findPublicProfile('jos%C3%A9');

      expect(prisma.user.findFirst.mock.calls[0][0].where.username.equals).toBe('josé');
    });

    it('username vazio → 400 sem tocar o banco', async () => {
      await expect(service.findPublicProfile('')).rejects.toThrow(BadRequestException);
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    });

    it('percent-encoding inválido não derruba a requisição', async () => {
      prisma.user.findFirst.mockResolvedValue(LINHA_COMPLETA);
      // '%E0%A4%A' é malformado — decodeURIComponent lançaria URIError.
      await expect(service.findPublicProfile('%E0%A4%A')).resolves.toBeDefined();
    });
  });
});
