import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Única saída do guard global (D2). Rota pública é uma declaração afirmativa e
 * greppável, não a ausência de uma checagem.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
