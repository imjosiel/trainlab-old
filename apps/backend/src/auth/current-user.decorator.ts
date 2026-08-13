import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { SessionPayload } from './session-payload';

/**
 * Lê o payload que o NextAuthJwtGuard colocou no request.
 *
 * Em rota protegida é sempre definido (o guard nega antes do handler). Em rota
 * `@Public()` pode ser undefined — daí o tipo opcional no ponto de uso.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionPayload | undefined =>
    context.switchToHttp().getRequest().user,
);
