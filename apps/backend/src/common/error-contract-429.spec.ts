import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';

import { ErrorContractFilter } from './error-contract.filter';

function hostWith() {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'POST', url: '/training-plans' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

/**
 * Fatia 27 (SDD: Info Disclosure + DoS) — RED.
 *
 * O 429 do `@nestjs/throttler` hoje não passa pelo contrato `{ error }`:
 * `ThrottlerException` carrega `{ message, error: 'Too Many Requests',
 * statusCode: 429 }` (formato padrão do Nest, em inglês) e o filtro o trata
 * como "padrão do Nest sem mensagem aproveitável" — o cliente recebe o texto
 * genérico de 429 em vez da mensagem PT-BR.
 */
describe('ErrorContractFilter — 429 do throttler (fatia 27)', () => {
  let filter: ErrorContractFilter;

  beforeEach(() => {
    filter = new ErrorContractFilter();
  });

  it('converte o 429 do throttler para { error } em português', () => {
    const { host, status, json } = hostWith();

    filter.catch(new ThrottlerException(), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);
    expect(json).toHaveBeenCalledWith({
      error: 'Muitas requisições. Tente novamente em alguns instantes.',
    });
  });

  it('preserva mensagem customizada do guard quando houver', () => {
    const { host, json } = hostWith();

    filter.catch(new ThrottlerException('Limite de criação de planos excedido.'), host);

    expect(json).toHaveBeenCalledWith({
      error: 'Limite de criação de planos excedido.',
    });
  });
});
