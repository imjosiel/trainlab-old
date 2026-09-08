import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '@/app.module';
import { CreditsService } from '@/credits/credits.service';
import { PrismaService } from '@/prisma/prisma.service';

const TAG = 'e2e-credits-corrida';

/**
 * D88 — a propriedade de concorrência do `gastar()` que um mock NUNCA prova:
 * um mock de `updateMany` devolve o que você mandar ele devolver, então uma
 * mutação que apaga o `where` da trava atômica passa ilesa pelos testes
 * unitários (achado ao rodar a verificação por mutação desta fatia). Só o
 * Postgres real, com escritas concorrentes de verdade, prova que a trava
 * funciona — mesmo padrão do D78 aplicado ao checkout na fatia 15.
 */
describe('gastar — corrida contra Postgres real (trava atômica do débito)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let credits: CreditsService;

  const usuarios = new Set<string>();
  let treinadorId: string;

  // A73 — SystemSettings é tabela-singleton: salva o estado original e
  // restaura, não só limpa o que a suíte criou.
  let settingsId: string | null = null;
  let enableCreditSystemOriginal: boolean | null = null;
  let criouSettings = false;

  beforeAll(async () => {
    process.env.NEXTAUTH_SECRET = 'e2e-secret-nao-usado-em-producao';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    credits = app.get(CreditsService);

    const treinador = await prisma.user.create({
      data: { email: `${TAG}-trainer@example.com`, name: `${TAG} trainer`, roles: ['PROFESSIONAL'] },
    });
    usuarios.add(treinador.id);
    treinadorId = treinador.id;

    const settingsExistente = await prisma.systemSettings.findFirst();
    if (settingsExistente) {
      settingsId = settingsExistente.id;
      enableCreditSystemOriginal = settingsExistente.enableCreditSystem;
      await prisma.systemSettings.update({ where: { id: settingsId }, data: { enableCreditSystem: true } });
    } else {
      const criado = await prisma.systemSettings.create({ data: { enableCreditSystem: true } });
      settingsId = criado.id;
      criouSettings = true;
    }
  });

  afterAll(async () => {
    if (settingsId) {
      if (criouSettings) {
        await prisma.systemSettings.delete({ where: { id: settingsId } });
      } else {
        await prisma.systemSettings.update({
          where: { id: settingsId },
          data: { enableCreditSystem: enableCreditSystemOriginal ?? false },
        });
      }
    }
    await prisma.creditTransaction.deleteMany({ where: { userId: treinadorId } });
    await prisma.userCredits.deleteMany({ where: { userId: treinadorId } });
    await prisma.user.deleteMany({ where: { id: { in: [...usuarios] } } });
    await app?.close();
  });

  it('saldo pra exatamente 2 débitos de 5: três tentativas simultâneas, exatamente 2 sucessos', async () => {
    await prisma.userCredits.upsert({
      where: { userId: treinadorId },
      create: { userId: treinadorId, planCredits: 10, purchasedCredits: 0 },
      update: { planCredits: 10, purchasedCredits: 0 },
    });

    const tentativas = await Promise.all([
      credits.gastar({ userId: treinadorId, cost: 5, feature: 'TEST' }),
      credits.gastar({ userId: treinadorId, cost: 5, feature: 'TEST' }),
      credits.gastar({ userId: treinadorId, cost: 5, feature: 'TEST' }),
    ]);

    const sucessos = tentativas.filter((t) => t.success);
    const falhas = tentativas.filter((t) => !t.success);

    // A propriedade que importa é financeira: exatamente 2 débitos passam, o
    // terceiro falha, e o saldo nunca fica negativo nem "perde" um update.
    // QUAL mensagem de erro a falha carrega depende de timing (pode bater na
    // pré-checagem de saldo OU na trava atômica do updateMany) — as duas são
    // desfechos corretos da mesma proteção, não um bug.
    expect(sucessos).toHaveLength(2);
    expect(falhas).toHaveLength(1);
    expect(falhas[0].error).toMatch(/Créditos insuficientes/);

    const saldoFinal = await prisma.userCredits.findUnique({ where: { userId: treinadorId } });
    expect(saldoFinal?.planCredits).toBe(0);
    expect(saldoFinal?.purchasedCredits).toBe(0);
  });

  /**
   * A90 — o teste acima é a propriedade certa, mas o desfecho dele depende do
   * escalonador: se as três chamadas não se sobrepuserem de verdade, ele passa
   * mesmo com a trava quebrada. Foi exatamente assim que o lost update abaixo
   * sobreviveu à fatia 17 e só apareceu como "falha intermitente" no CI.
   *
   * Aqui a janela entre a LEITURA do saldo e a escrita da trava é alargada de
   * propósito (só no teste), forçando as três a lerem antes de qualquer uma
   * escrever. É o mesmo instrumento do D98a — com a diferença de que lá ele
   * serviu pra fazer um teste fraco começar a falhar, e aqui serve pra tornar
   * determinística uma falha que já existia.
   */
  it('A90 — janela alargada: três débitos que leem o mesmo saldo não podem virar três sucessos', async () => {
    await prisma.userCredits.upsert({
      where: { userId: treinadorId },
      create: { userId: treinadorId, planCredits: 10, purchasedCredits: 0 },
      update: { planCredits: 10, purchasedCredits: 0 },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delegate = prisma.userCredits as any;
    const leituraOriginal = delegate.findUnique.bind(delegate);
    const spy = jest
      .spyOn(delegate, 'findUnique')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation(async (...args: any[]) => {
        const linha = await leituraOriginal(...args);
        await new Promise((resolve) => setTimeout(resolve, 60));
        return linha;
      });

    let tentativas;
    try {
      tentativas = await Promise.all([
        credits.gastar({ userId: treinadorId, cost: 5, feature: 'TEST' }),
        credits.gastar({ userId: treinadorId, cost: 5, feature: 'TEST' }),
        credits.gastar({ userId: treinadorId, cost: 5, feature: 'TEST' }),
      ]);
    } finally {
      spy.mockRestore();
    }

    expect(tentativas.filter((t) => t.success)).toHaveLength(2);

    // A asserção que mata o lost update: o saldo tem que refletir 2 débitos de
    // 5 sobre 10. Três escritas absolutas de uma leitura velha deixariam 5 aqui.
    const saldoFinal = await prisma.userCredits.findUnique({ where: { userId: treinadorId } });
    expect(saldoFinal?.planCredits).toBe(0);
  });
});
