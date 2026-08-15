import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';

/**
 * Sem NEXTAUTH_SECRET o guard cai no ramo fail-closed e TODA requisição responde
 * 401 — inclusive com token perfeitamente válido. O sintoma é indistinguível de
 * "token errado" e de "segredo divergente", e a suíte não acusa nada disso,
 * porque cada teste define a variável por conta própria (lição da fatia 1).
 *
 * Falhar alto no boot elimina um dos três suspeitos antes de alguém começar a
 * depurar. Não cobre segredo PRESENTE mas divergente do frontend — esse caso
 * continua parecendo token inválido, e foi exatamente o que aconteceu na
 * verificação desta fatia (A14).
 */
function exigirSegredoDeSessao(): void {
  if (process.env.NEXTAUTH_SECRET) return;

  console.error(
    '\n[backend] ERRO FATAL: NEXTAUTH_SECRET não definido.\n' +
      '  Sem ele o guard nega TODA requisição com 401, mesmo com token válido.\n' +
      '  O ConfigModule procura .env a partir do cwd — suba o servidor de dentro\n' +
      '  de apps/backend, ou pelos scripts do workspace, que já fazem isso.\n',
  );
  process.exit(1);
}

async function bootstrap(): Promise<void> {
  // `rawBody: true` — o webhook do Stripe verifica a assinatura sobre os bytes
  // exatos do corpo. O parser padrão do Express reserializa o JSON, e a
  // verificação falharia mesmo com o segredo certo. Nest preenche
  // `request.rawBody` mantendo o parse normal para todo o resto.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  exigirSegredoDeSessao();

  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('TrainLab API')
    .setDescription(
      'Backend de regras de negócio. Autenticação por JWT emitido pelo NextAuth ' +
        'no frontend — cole em Authorize o mesmo token que o BFF envia.',
    )
    .setVersion('0.1.0')
    // Mesmo esquema que o BFF usa (D8), para a doc ser exercitável com sessão real.
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWE',
      description: 'Token de sessão do NextAuth (criptografado, não um JWT assinado).',
    })
    .build();

  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`[backend] ouvindo em http://localhost:${port} — docs em /docs`);
}

void bootstrap();
