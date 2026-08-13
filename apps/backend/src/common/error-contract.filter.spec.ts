import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { ErrorContractFilter } from './error-contract.filter';

function hostWith() {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'GET', url: '/qualquer' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('ErrorContractFilter', () => {
  let filter: ErrorContractFilter;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    filter = new ErrorContractFilter();
    logSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => logSpy.mockRestore());

  it('preserva corpo que já segue o contrato { error }', () => {
    const { host, status, json } = hostWith();

    filter.catch(new NotFoundException({ error: 'Esporte não encontrado' }), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ error: 'Esporte não encontrado' });
  });

  it('preserva campos extras junto do error', () => {
    const { host, json } = hostWith();

    filter.catch(
      new BadRequestException({ error: 'Existem 3 atletas vinculados.', canDelete: false }),
      host,
    );

    expect(json).toHaveBeenCalledWith({
      error: 'Existem 3 atletas vinculados.',
      canDelete: false,
    });
  });

  /**
   * O caso que motivou o filtro: rota inexistente 404 antes de qualquer guard,
   * com o corpo padrão do Nest. Um cliente lendo `data.error` recebia
   * "Not Found" em inglês.
   */
  it('converte o 404 padrão do Nest para { error } em português', () => {
    const { host, status, json } = hostWith();

    filter.catch(new NotFoundException(), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ error: 'Recurso não encontrado' });
  });

  /**
   * O caso concreto reportado: acessar http://localhost:3001/ devolvia
   * `{"message":"Cannot GET /","error":"Not Found","statusCode":404}`.
   * O "Cannot GET /x" vem do router do Express, é inglês e revela roteamento.
   */
  it('converte o "Cannot GET /" do router, sem repassá-lo ao cliente', () => {
    const { host, status, json } = hostWith();

    filter.catch(
      new NotFoundException({
        message: 'Cannot GET /',
        error: 'Not Found',
        statusCode: 404,
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ error: 'Recurso não encontrado' });
  });

  it.each([
    ['GET', 'Cannot GET /nao-existe'],
    ['POST', 'Cannot POST /admin/sports'],
    ['DELETE', 'Cannot DELETE /x/y'],
  ])('converte o miss de router de %s', (_verbo, message) => {
    const { host, json } = hostWith();
    filter.catch(new NotFoundException({ message, error: 'Not Found', statusCode: 404 }), host);
    expect(json).toHaveBeenCalledWith({ error: 'Recurso não encontrado' });
  });

  it('mensagem de domínio que MENCIONA um verbo não é confundida com miss de router', () => {
    const { host, json } = hostWith();
    filter.catch(new NotFoundException('Não foi possível GET os dados do aluno'), host);
    expect(json).toHaveBeenCalledWith({ error: 'Não foi possível GET os dados do aluno' });
  });

  it('converte 401 sem corpo próprio', () => {
    const { host, json } = hostWith();
    filter.catch(new UnauthorizedException(), host);
    expect(json).toHaveBeenCalledWith({ error: 'Não autorizado' });
  });

  it('converte 403 sem corpo próprio', () => {
    const { host, json } = hostWith();
    filter.catch(new ForbiddenException(), host);
    expect(json).toHaveBeenCalledWith({ error: 'Acesso negado' });
  });

  it('usa a mensagem quando a exception foi construída com string', () => {
    const { host, json } = hostWith();
    filter.catch(new BadRequestException('Nome é obrigatório.'), host);
    expect(json).toHaveBeenCalledWith({ error: 'Nome é obrigatório.' });
  });

  it('junta as mensagens de validação em uma linha', () => {
    const { host, json } = hostWith();

    // Formato que o ValidationPipe do Nest produz.
    filter.catch(
      new BadRequestException({ message: ['name não pode ser vazio', 'slug é inválido'] }),
      host,
    );

    expect(json).toHaveBeenCalledWith({ error: 'name não pode ser vazio; slug é inválido' });
  });

  it('mantém o status de qualquer HttpException', () => {
    const { host, status } = hostWith();
    filter.catch(new HttpException({ error: 'Conflito' }, HttpStatus.CONFLICT), host);
    expect(status).toHaveBeenCalledWith(409);
  });

  describe('erro não previsto', () => {
    it('vira 500 com mensagem genérica, sem vazar o interno', () => {
      const { host, status, json } = hostWith();

      filter.catch(new Error('connect ECONNREFUSED 127.0.0.1:5432'), host);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Erro interno' });
    });

    it('mas registra o erro real no log do servidor', () => {
      const { host } = hostWith();
      const boom = new Error('detalhe que não vai para o cliente');

      filter.catch(boom, host);

      expect(logSpy).toHaveBeenCalled();
      expect(logSpy.mock.calls[0].join(' ')).toContain('detalhe que não vai para o cliente');
    });

    it('não vaza nem quando o lançado não é Error', () => {
      const { host, status, json } = hostWith();
      filter.catch('string solta', host);
      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Erro interno' });
    });
  });
});
