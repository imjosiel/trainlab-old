import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

const FROM = 'Player.Action <noreply@playeraction.com>';

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function baseTemplate(content: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; margin: 0; padding: 40px 20px;">
  <div style="max-width: 520px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="background: linear-gradient(135deg, #16a34a, #15803d); padding: 32px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">⚽ Player.Action</h1>
      <p style="color: #bbf7d0; margin: 8px 0 0; font-size: 14px;">Plataforma de Treinos com IA</p>
    </div>
    <div style="padding: 32px;">${content}</div>
  </div>
</body>
</html>`;
}

/**
 * D86 — porta fina, mesmo padrão do StripeService (D66).
 *
 * Ausência de `RESEND_API_KEY` loga e segue sem lançar — paridade com o
 * legado, que já trata a chave ausente como modo silencioso, não erro.
 * Falha no envio também não lança: e-mail é notificação acessória, o convite
 * em si já foi gravado antes desta chamada.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private cliente: Resend | null | undefined;

  private sdk(): Resend | null {
    if (this.cliente !== undefined) return this.cliente;

    const chave = process.env.RESEND_API_KEY;
    if (!chave) {
      this.logger.warn('RESEND_API_KEY não configurada — e-mails não serão enviados.');
      this.cliente = null;
      return this.cliente;
    }

    this.cliente = new Resend(chave);
    return this.cliente;
  }

  async enviarConviteDeAtleta(dados: {
    athleteEmail: string;
    trainerName: string;
    inviteToken: string;
  }): Promise<void> {
    const resend = this.sdk();
    if (!resend) return;

    const base = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
    const inviteUrl = `${base}/invite/${dados.inviteToken}`;

    try {
      await resend.emails.send({
        from: FROM,
        to: dados.athleteEmail,
        subject: `🤝 ${dados.trainerName} te convidou para o Player.Action`,
        html: baseTemplate(`
          <h2 style="color: #16a34a; margin: 0 0 8px;">Você foi convidado! 🎉</h2>
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">
            O professor <strong>${escapeHtml(dados.trainerName)}</strong> te convidou para fazer parte do Player.Action —
            a plataforma definitiva para acompanhamento de treinos esportivos.
          </p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${inviteUrl}"
               style="background: #16a34a; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">
              Aceitar Convite →
            </a>
          </div>
          <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
            Link válido por 7 dias. Se você não esperava este convite, ignore este email.
          </p>
        `),
      });
    } catch (erro) {
      this.logger.warn(
        `Falha ao enviar convite para ${dados.athleteEmail}: ${erro instanceof Error ? erro.message : String(erro)}`,
      );
    }
  }

  /** D90 — mesmo padrão do resto do EmailService (D86): nunca lança. */
  async enviarPlanoAprovado(dados: {
    athleteName: string;
    athleteEmail: string;
    trainerName: string;
    planTitle: string;
  }): Promise<void> {
    const resend = this.sdk();
    if (!resend) return;

    const base = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

    try {
      await resend.emails.send({
        from: FROM,
        to: dados.athleteEmail,
        subject: `✅ Seu plano de treino foi aprovado — ${dados.planTitle}`,
        html: baseTemplate(`
          <h2 style="color: #16a34a; margin: 0 0 8px;">Plano aprovado! 🎉</h2>
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">
            Olá, <strong>${escapeHtml(dados.athleteName)}</strong>! O seu treinador <strong>${escapeHtml(dados.trainerName)}</strong>
            acabou de aprovar o seu plano de treino personalizado.
          </p>
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0; color: #166534; font-size: 14px; font-weight: 600;">📋 ${escapeHtml(dados.planTitle)}</p>
          </div>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${base}/dashboard"
               style="background: #16a34a; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">
              Ver Meu Plano →
            </a>
          </div>
        `),
      });
    } catch (erro) {
      this.logger.warn(
        `Falha ao enviar aprovação do plano para ${dados.athleteEmail}: ${erro instanceof Error ? erro.message : String(erro)}`,
      );
    }
  }

  async enviarPlanoConcluido(dados: {
    trainerName: string;
    trainerEmail: string;
    athleteName: string;
    planTitle: string;
  }): Promise<void> {
    const resend = this.sdk();
    if (!resend) return;

    const base = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

    try {
      await resend.emails.send({
        from: FROM,
        to: dados.trainerEmail,
        subject: `🏆 ${dados.athleteName} concluiu o plano — ${dados.planTitle}`,
        html: baseTemplate(`
          <h2 style="color: #16a34a; margin: 0 0 8px;">Plano concluído! 🏆</h2>
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">
            Olá, <strong>${escapeHtml(dados.trainerName)}</strong>! O atleta <strong>${escapeHtml(dados.athleteName)}</strong>
            acaba de concluir todas as sessões do plano:
          </p>
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0; color: #166534; font-size: 14px; font-weight: 600;">📋 ${escapeHtml(dados.planTitle)}</p>
          </div>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${base}/dashboard/students"
               style="background: #16a34a; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">
              Ver Atletas →
            </a>
          </div>
        `),
      });
    } catch (erro) {
      this.logger.warn(
        `Falha ao enviar conclusão do plano para ${dados.trainerEmail}: ${erro instanceof Error ? erro.message : String(erro)}`,
      );
    }
  }
}
