import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@/prisma/prisma.service';
import type { SessionPayload } from '@/auth/session-payload';
import { PUBLIC_PROFILE_SELECT } from './public-profile.select';
import { OWN_PROFILE_SELECT, PATCH_PROFILE_SELECT } from './own-profile.select';
import { ProfileStatsService } from './profile-stats.service';
import {
  MSG_USERNAME_EM_USO,
  nomeDoIdToken,
  normalizarTelefone,
  resolverPapeis,
  validarUsername,
} from './update-profile';

/** Não deixa percent-encoding malformado virar 500 (`decodeURIComponent` lança). */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Corpo do PATCH. Os seis campos abaixo são a allowlist de ENTRADA — o corpo
 * nunca é espalhado em `data`, cada campo é lido por nome e convertido à mão.
 *
 * Isso é o que impede `systemRoles: ['ADMIN']` no corpo de virar escalada de
 * privilégio. Já estava certo no legado; o que faltava era alguém provando por
 * teste, porque é uma garantia que um refactor apaga sem perceber. Ver D31/D32.
 */
interface UpdateProfileBody {
  username?: unknown;
  bio?: unknown;
  isPublic?: unknown;
  name?: unknown;
  role?: unknown;
  phone?: unknown;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stats: ProfileStatsService,
  ) {}

  async findPublicProfile(username: string) {
    if (!username) throw new BadRequestException({ error: 'Username não fornecido.' });

    const user = await this.prisma.user.findFirst({
      where: { username: { equals: safeDecode(username), mode: 'insensitive' } },
      select: PUBLIC_PROFILE_SELECT,
    });

    // Mesma resposta para "não existe" e "não é público" (D24): 403 no privado
    // confirmaria que o @username existe, e username é derivado do nome real.
    if (!user || !user.isPublic) {
      throw new NotFoundException({ error: 'Usuário não encontrado.' });
    }

    // `isPublic` foi lido só para esta decisão; não faz parte do que se expõe.
    const { isPublic: _isPublic, ...publico } = user;
    return { user: publico };
  }

  /**
   * Contatos profissionais do aluno no segmento B2B.
   *
   * Posse por filtro: `userId` vem exclusivamente da sessão, nunca da URL ou
   * do corpo. Assim, um token de aluno não pode enumerar os treinadores de
   * outro aluno. O formato (inclusive e-mail do treinador) é o mesmo da rota
   * legada, usada para iniciar conversas privadas.
   */
  async findMyTrainers(userId: string) {
    const studentRecords = await this.prisma.student.findMany({
      where: { userId },
      // Limite e ausência de ordenação preservados da implementação legada.
      take: 50,
      include: {
        trainer: { select: { id: true, name: true, image: true, email: true } },
      },
    });

    // Um usuário pode ter mais de uma ficha sob o mesmo treinador; o seletor
    // de conversa precisa de um contato por pessoa, não de uma ficha por vez.
    const seen = new Set<string>();
    const trainers = studentRecords
      .map((student) => student.trainer)
      .filter((trainer) => {
        if (seen.has(trainer.id)) return false;
        seen.add(trainer.id);
        return true;
      });

    return { trainers };
  }

  async findOwnProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: OWN_PROFILE_SELECT,
    });

    // Só acontece se o token for válido e a linha tiver sido apagada no meio —
    // janela estreita mas real (D35).
    if (!user) throw new NotFoundException({ error: 'Usuário não encontrado.' });

    const stats = await this.stats.compute(userId);

    // `_count` sai do corpo: os mesmos dois números já vão em `stats`, e nenhum
    // consumidor lê `_count` (conferido por grep nos três chamadores). Ver D27.
    const { _count, ...perfil } = user;
    return {
      ...perfil,
      stats: { followers: _count.followers, following: _count.following, ...stats },
    };
  }

  async updateOwnProfile(session: SessionPayload, body: UpdateProfileBody) {
    const { username, bio, isPublic, name, role, phone } = body ?? {};
    const data: Record<string, unknown> = {};

    if (username !== undefined) {
      const validado = validarUsername(username);

      // Checagem prévia para dar 409 com mensagem legível. Não substitui o
      // tratamento de P2002 abaixo: entre esta leitura e o update existe uma
      // janela em que outra pessoa reivindica o mesmo @username (BUG-114).
      const emUso = await this.prisma.user.findFirst({
        where: {
          username: { equals: validado, mode: 'insensitive' },
          NOT: { id: session.id },
        },
        select: { id: true },
      });
      if (emUso) throw new ConflictException({ error: MSG_USERNAME_EM_USO });

      data.username = validado;
    }

    // Único limite de tamanho da bio — não há validação antes dele, então fica.
    if (bio !== undefined) data.bio = String(bio).substring(0, 1000);
    if (isPublic !== undefined) data.isPublic = Boolean(isPublic);
    if (phone !== undefined) data.phone = normalizarTelefone(phone);

    if (role !== undefined) {
      const atuais = await this.prisma.user.findUnique({
        where: { id: session.id },
        select: { roles: true },
      });
      const papeis = resolverPapeis(atuais?.roles ?? [], role);
      // `undefined` = papel fora da lista: nada muda e a resposta é 200 (D30).
      if (papeis) data.roles = { set: papeis };
    }

    if (name !== undefined) data.name = await this.resolverNome(session, name);

    try {
      // Posse por construção: o `where` é o id da SESSÃO, nunca do corpo. Não há
      // leitura-e-depois-checagem que alguém possa esquecer de fazer.
      return await this.prisma.user.update({
        where: { id: session.id },
        data,
        select: PATCH_PROFILE_SELECT,
      });
    } catch (error) {
      // Corrida por @username: o findFirst devolveu null para os dois, e o
      // segundo update bate na constraint. É conflito, não erro interno.
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException({ error: MSG_USERNAME_EM_USO });
      }
      throw error;
    }
  }

  /**
   * Nome vazio não apaga o nome: tenta reconstruir do id_token do Google, cai
   * para o prefixo do email e, em último caso, para 'Usuário' (D34).
   */
  private async resolverNome(session: SessionPayload, name: unknown): Promise<string> {
    if (String(name).trim() !== '') return String(name).trim().substring(0, 50);

    const account = await this.prisma.account.findFirst({
      where: { userId: session.id, provider: 'google' },
      select: { id_token: true },
    });

    const doGoogle = nomeDoIdToken(account?.id_token);
    const fallback = doGoogle ?? session.email?.split('@')[0] ?? null;
    return fallback ? String(fallback).substring(0, 50) : 'Usuário';
  }
}
