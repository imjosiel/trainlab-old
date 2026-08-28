import { Injectable, Logger } from '@nestjs/common';
import Groq from 'groq-sdk';

interface AiDia { dia: number; titulo: string; duracaoMinutos?: number; intensidade?: string; descricaoCompleta?: string; exercicios?: any[] }
interface AiJson { resumoExecutivo?: string; dicasFinais?: string; dias: AiDia[] }

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private groq: Groq | null = null;

  private getGroq(): Groq {
    if (this.groq) return this.groq;
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY ?? 'dummy' });
    return this.groq;
  }

  async gerarPlano(args: { targetName: string; profile: any; duration: number; availableExercises: any[]; ragContext?: string }): Promise<AiJson> {
    const { targetName, profile, duration, availableExercises } = args;
    const isMockMode = !process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'dummy' || process.env.GROQ_API_KEY.includes('placeholder');
    // Fallback local se GROQ_API_KEY ausente/inválida em dev — retorna skeleton mínimo para não quebrar sem chave válida
    if (isMockMode && process.env.NODE_ENV !== 'production') {
      this.logger.warn('[AI] GROQ_API_KEY ausente/inválida — retornando plano mock');
      return {
        resumoExecutivo: `Plano mock para ${targetName} (${duration} dias)`,
        dicasFinais: 'Mock — configure GROQ_API_KEY válida para IA real',
        dias: [{ dia: 1, titulo: 'Sessão Mock', duracaoMinutos: 60, intensidade: 'Média', descricaoCompleta: 'Treino mock', exercicios: [] }],
      };
    }
    // Lógica real simplificada: 1 skeleton call (sem batch de exercícios) — o batch completo fica para próxima iteração
    // Para manter paridade, delega para Groq com prompt reduzido
    const groq = this.getGroq();
    const prompt = `Gere 1 sessão para ${targetName} (${profile?.position ?? 'N/A'}), ${duration} dias, nível ${profile?.technicalLevel ?? 'N/A'}. Retorne JSON {"resumoExecutivo":"...","dicasFinais":"...","dias":[{"dia":1,"titulo":"...","duracaoMinutos":60,"intensidade":"Média","descricaoCompleta":"..."}]}`;
    try {
      const r = await groq.chat.completions.create({
        messages: [{ role: 'system', content: 'Você é um planejador esportivo. Responda em JSON.' }, { role: 'user', content: prompt }] as any,
        model: 'llama-3.1-8b-instant',
        temperature: 0.7,
        max_tokens: 1500,
        response_format: { type: 'json_object' } as any,
      });
      return JSON.parse(r.choices?.[0]?.message?.content ?? '{}') as AiJson;
    } catch (e: any) {
      // Fallback para mock em dev se API key inválida (401) ou rate limit (429) com LOCAL_AI_URL
      const isAuthError = e?.status === 401 || e?.error?.code === 'invalid_api_key';
      if (process.env.NODE_ENV !== 'production' && isAuthError) {
        this.logger.warn('[AI] GROQ_API_KEY inválida — fallback mock em dev');
        return {
          resumoExecutivo: `Plano mock para ${targetName} (${duration} dias)`,
          dicasFinais: 'Mock — GROQ_API_KEY inválida, usando fallback',
          dias: [{ dia: 1, titulo: 'Sessão Mock', duracaoMinutos: 60, intensidade: 'Média', descricaoCompleta: 'Treino mock', exercicios: [] }],
        };
      }
      if (e?.status === 429 && process.env.LOCAL_AI_URL) {
        this.logger.warn('[AI] Groq 429, fallback local');
        const localRes = await fetch(`${process.env.LOCAL_AI_URL}/v1/chat/completions`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: process.env.LOCAL_AI_MODEL ?? 'gemma3:4b', messages: [{ role: 'user', content: prompt }], max_tokens: 1000, temperature: 0.7 }),
          signal: AbortSignal.timeout(120000),
        });
        if (localRes.ok) {
          const d: any = await localRes.json();
          const raw = d.choices?.[0]?.message?.content ?? '{}';
          const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
          return JSON.parse(cleaned) as AiJson;
        }
      }
      throw e;
    }
  }
}
