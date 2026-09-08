import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

/**
 * Garante que TODA resposta de erro deste serviço saia como `{ error: string }`.
 *
 * Por que existe: o contrato `{ error }` (D5) é aplicado onde o código lança a
 * exception, mas há erros que nascem fora do nosso código — o 404 do router
 * para caminho inexistente, que acontece antes de qualquer guard, e sai no
 * formato padrão do Nest (`{ message, error: 'Not Found', statusCode }`). Um
 * cliente lendo `data.error` recebia "Not Found", em inglês.
 *
 * Aqui a garantia deixa de ser "cada lugar que lança se lembra" e passa a ser
 * estrutural, mesma lógica do guard global: vale também para o erro que ainda
 * não foi escrito.
 */
const DEFAULT_BY_STATUS: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'Requisição inválida',
  [HttpStatus.UNAUTHORIZED]: 'Não autorizado',
  [HttpStatus.FORBIDDEN]: 'Acesso negado',
  [HttpStatus.NOT_FOUND]: 'Recurso não encontrado',
  [HttpStatus.CONFLICT]: 'Conflito',
  // Fatia 27 (SDD: Info Disclosure) — 429 do throttler sai em PT-BR, não o
  // "Too Many Requests" padrão do Nest.
  [HttpStatus.TOO_MANY_REQUESTS]: 'Muitas requisições. Tente novamente em alguns instantes.',
};

/**
 * Frases que o próprio HTTP/Nest gera. Não carregam informação de domínio —
 * são o nome do status em inglês — então dão lugar ao texto em português.
 */
const GENERIC_PHRASES = new Set([
  'Bad Request',
  'Unauthorized',
  'Forbidden',
  'Not Found',
  'Conflict',
  'Too Many Requests',
  'ThrottlerException: Too Many Requests',
  'Internal Server Error',
]);

/** Forma que o router do Express usa para caminho inexistente: "Cannot GET /". */
const ROUTER_MISS = /^Cannot (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) /;

const isGeneric = (message: string): boolean =>
  GENERIC_PHRASES.has(message) || ROUTER_MISS.test(message);

@Catch()
export class ErrorContractFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse();
    const request = http.getRequest();

    if (!(exception instanceof HttpException)) {
      // Erro não previsto: o cliente recebe uma mensagem genérica (nada de
      // string de conexão ou stack), e o detalhe real fica no log do servidor.
      console.error(`[ERRO] ${request?.method} ${request?.url}`, exception);
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Erro interno' });
      return;
    }

    const status = exception.getStatus();
    response.status(status).json(this.bodyFor(exception, status));
  }

  private bodyFor(exception: HttpException, status: number): Record<string, unknown> {
    const payload = exception.getResponse();

    if (typeof payload === 'object' && payload !== null) {
      const obj = payload as Record<string, unknown>;

      // O corpo padrão do Nest TAMBÉM tem uma chave `error` — com o valor em
      // inglês ('Not Found', 'Unauthorized'). Então a presença de `error` não
      // distingue nada. O discriminador é `statusCode`: o padrão do Nest sempre
      // o inclui, e o nosso contrato nunca.
      const isNestDefault = typeof obj.statusCode === 'number';

      // Nosso contrato: repassa verbatim, preservando campos extras
      // (`canDelete`, contagens etc.) que os services usam.
      if (!isNestDefault && typeof obj.error === 'string') return obj;

      // Formato do ValidationPipe: `message` como lista.
      if (Array.isArray(obj.message)) {
        return { error: obj.message.join('; ') };
      }

      // `message` só é aproveitada se disser algo — não se for o nome do status
      // em inglês nem o "Cannot GET /x" do router.
      if (typeof obj.message === 'string' && !isGeneric(obj.message)) {
        return { error: obj.message };
      }
    }

    if (typeof payload === 'string') {
      // ThrottlerException chega como string ("ThrottlerException: Too Many
      // Requests") — traduz para o contrato em PT-BR em vez de repassar.
      if (isGeneric(payload) || payload.includes('Too Many Requests')) {
        return { error: DEFAULT_BY_STATUS[status] ?? 'Erro interno' };
      }
      return { error: payload };
    }

    return { error: DEFAULT_BY_STATUS[status] ?? 'Erro interno' };
  }
}
