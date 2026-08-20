import { Injectable, Logger } from '@nestjs/common';
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

/**
 * D99 (fatia 23) — porta pro armazenamento de vídeo (R2) e pro disparo de
 * processamento assíncrono (GH Actions). Mesmo espírito do `StripeService`
 * (D66): SDK só existe atrás desta porta, nunca chamado de dentro do
 * `ExercisesService` — o que faz esta classe nunca ganhar spec própria,
 * só ser mockada nos testes de quem a usa.
 *
 * Local ao módulo de exercises por enquanto — sem segundo chamador real
 * ainda (a fatia de `upload/*` é candidata), generalizar antes disso seria
 * o erro que os D95/D97 evitaram.
 */
@Injectable()
export class ExerciseStorageService {
  private readonly logger = new Logger(ExerciseStorageService.name);
  private cliente: S3Client | null = null;

  private sdk(): S3Client {
    if (this.cliente) return this.cliente;
    this.cliente = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
      },
    });
    return this.cliente;
  }

  /** No-op sem o token, igual ao legado — não é caminho crítico o bastante pra lançar. */
  async dispararProcessamentoDeVideo(): Promise<void> {
    const token = process.env.GITHUB_ACTIONS_TOKEN;
    if (!token) return;
    try {
      await fetch(
        'https://api.github.com/repos/Scryter/playeraction/actions/workflows/process.yml/dispatches',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ref: 'main' }),
        },
      );
    } catch (erro) {
      this.logger.warn(`Disparo do GH Actions falhou: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }

  async apagarArquivos(prefix: string): Promise<void> {
    if (!prefix || !process.env.R2_BUCKET_NAME) return;
    const bucket = process.env.R2_BUCKET_NAME;
    let token: string | undefined;

    do {
      const listado = await this.sdk().send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
      );
      if (listado.Contents?.length) {
        await this.sdk().send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: listado.Contents.map((o) => ({ Key: o.Key })) },
          }),
        );
      }
      token = listado.IsTruncated ? listado.NextContinuationToken : undefined;
    } while (token);
  }
}
