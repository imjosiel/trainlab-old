import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { decode } from 'next-auth/jwt';

import { IS_PUBLIC_KEY } from './public.decorator';
import { SessionPayload, toSessionPayload } from './session-payload';

const BEARER_PREFIX = 'Bearer ';

/**
 * Guard global (APP_GUARD) — default-deny.
 *
 * Decodifica o mesmo JWE que o NextAuth emite no frontend (D1): não existe um
 * segundo emissor de identidade, só um segundo consumidor.
 *
 * Não consulta o banco (D4): a atualidade dos dados é responsabilidade do
 * callback `jwt` do NextAuth, que já re-verifica a cada 15 minutos.
 */
@Injectable()
export class NextAuthJwtGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const session = await this.resolveSession(request);

    if (session) {
      request.user = session;
      return true;
    }

    // Público significa "não exige sessão", não "ignora a sessão" — por isso a
    // resolução acima roda de qualquer jeito e popula request.user quando dá.
    if (isPublic) return true;

    throw new UnauthorizedException({ error: 'Não autorizado' });
  }

  private async resolveSession(request: {
    headers?: Record<string, unknown>;
  }): Promise<SessionPayload | null> {
    const header = request.headers?.authorization;
    if (typeof header !== 'string' || !header.startsWith(BEARER_PREFIX)) {
      return null;
    }

    const token = header.slice(BEARER_PREFIX.length).trim();
    if (!token) return null;

    // Falha fechado: sem secret não há como distinguir token legítimo de forjado.
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) return null;

    try {
      return toSessionPayload(await decode({ token, secret }));
    } catch {
      // Token corrompido/expirado/assinado com outro secret. Indistinguível de
      // ausente para efeito de autorização.
      return null;
    }
  }
}
