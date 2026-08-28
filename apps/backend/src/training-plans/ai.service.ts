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

  private sanitizeForPrompt(str: string | null | undefined, maxLen = 300): string {
    if (!str) return '';
    return String(str).replace(/```/g, "'''").replace(/^(#{1,6}|---) /gm, '').replace(/\bignore\b.*\binstructi/gi, '[removido]').slice(0, maxLen).trim();
  }
  private stripHtml(html: string | null | undefined): string {
    if (!html) return '';
    return String(html).replace(/<[^>]+>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private async callAI(messages: { role: string; content: string }[], maxTokens: number, aiProvider: string, geminiModel: string): Promise<AiJson> {
    if (aiProvider === 'gemini') {
      const key = process.env.GEMINI_API_KEY;
      if (!key) throw new Error('GEMINI_API_KEY não configurada');
      const systemMsg = messages.find((m) => m.role === 'system')?.content ?? '';
      const userMsgs = messages.filter((m) => m.role !== 'system');
      const body: any = {
        contents: userMsgs.map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })),
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: Math.min(maxTokens, 8192), temperature: 0.7 },
        ...(systemMsg ? { systemInstruction: { parts: [{ text: systemMsg }] } } : {}),
      };
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${key}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000),
      });
      if (!res.ok) {
        const err: any = await res.json().catch(() => ({}));
        throw new Error(`Gemini API error ${res.status}: ${err?.error?.message ?? res.statusText}`);
      }
      const data: any = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      return JSON.parse(cleaned) as AiJson;
    }
    const groq = this.getGroq();
    try {
      const r = await groq.chat.completions.create({
        messages: messages as any,
        model: 'llama-3.1-8b-instant',
        temperature: 0.7,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' } as any,
      });
      return JSON.parse(r.choices?.[0]?.message?.content ?? '{}') as AiJson;
    } catch (e: any) {
      const status = e?.status ?? e?.statusCode;
      if (status === 429 && process.env.LOCAL_AI_URL) {
        this.logger.warn('[AI] Groq 429, fallback local');
        const localRes = await fetch(`${process.env.LOCAL_AI_URL}/v1/chat/completions`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: process.env.LOCAL_AI_MODEL ?? 'gemma3:4b', messages, max_tokens: Math.floor(maxTokens * 0.7), temperature: 0.7, stream: false }),
          signal: AbortSignal.timeout(120000),
        });
        if (localRes.ok) {
          const d: any = await localRes.json();
          const raw = d.choices?.[0]?.message?.content ?? '';
          const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
          return JSON.parse(cleaned) as AiJson;
        }
      }
      throw e;
    }
  }

  async gerarPlano(args: { targetName: string; profile: any; duration: number; availableExercises: any[]; ragContext?: string }): Promise<AiJson> {
    const { targetName, profile, duration, availableExercises, ragContext = '' } = args;
    const isMockMode = !process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'dummy' || process.env.GROQ_API_KEY.includes('placeholder');
    if (isMockMode && process.env.NODE_ENV !== 'production') {
      this.logger.warn('[AI] GROQ_API_KEY ausente/inválida — retornando plano mock');
      return {
        resumoExecutivo: `Plano mock para ${targetName} (${duration} dias)`,
        dicasFinais: 'Mock — configure GROQ_API_KEY válida para IA real',
        dias: [{ dia: 1, titulo: 'Sessão Mock', duracaoMinutos: 60, intensidade: 'Média', descricaoCompleta: 'Treino mock', exercicios: [] }],
      };
    }
    // Config IA
    let aiProvider = 'groq';
    let geminiModel = 'gemini-2.0-flash';
    // disponível via SystemSettings mas já injetado via caller? Mantém fallback
    const daysPerWeek = (profile?.trainingDaysPerWeek as number) || 5;
    const hoursPerDay = (profile?.trainingHoursPerDay as number) || 1;
    const sessionMinutes = hoursPerDay * 60;
    let calculatedAge: string | number = 'N/A';
    if (profile?.dateOfBirth) {
      const diffMs = Date.now() - new Date(profile.dateOfBirth as string).getTime();
      calculatedAge = Math.abs(new Date(diffMs).getUTCFullYear() - 1970);
    }
    const exercisesListText = availableExercises
      .map((ex) => {
        const desc = ex.aiSummary ? this.sanitizeForPrompt(ex.aiSummary, 150) : this.sanitizeForPrompt(this.stripHtml(ex.description), 200);
        return `ID:${ex.id} | ${ex.name} | ${ex.category} | ${ex.difficulty} | ${desc}`;
      })
      .join('\n');
    const injuryNote = profile?.currentInjuries ? `\n**RESTRIÇÃO DE LESÃO:** NÃO selecione exercícios que estressem: ${this.sanitizeForPrompt(profile.currentInjuries as string, 200)}.` : '';
    const sessionsPerWeek = Math.min(daysPerWeek, 7);
    const exPerSession = Math.min(availableExercises.length, 7);
    const totalWeeks = Math.round(duration / 7);
    const horizonLabel = duration <= 14 ? `${duration} dias` : duration <= 35 ? '1 mês' : duration <= 95 ? '3 meses' : duration <= 185 ? '6 meses' : '12 meses';
    let periodizationGuidance = '';
    if (totalWeeks <= 4) periodizationGuidance = 'Use progressão linear simples.';
    else if (totalWeeks <= 12) periodizationGuidance = 'Use ondulação: 3 semanas carga + 1 recuperação.';
    else periodizationGuidance = `Divida em blocos de 4-6 semanas: base, específico, pico. Total: ${totalWeeks} semanas.`;
    const skeletonPrompt = `Planeje EXATAMENTE ${sessionsPerWeek} sessões (1 semana-modelo) para:\n- ${targetName} | ${calculatedAge} anos | ${profile?.position ?? 'N/A'}\n- Nível: ${profile?.technicalLevel ?? 'N/A'} | Objetivos: ${this.sanitizeForPrompt(profile?.goals as string, 300) || 'N/A'}\n- Lesões: ${this.sanitizeForPrompt(profile?.currentInjuries as string, 200) || 'Nenhuma'}${injuryNote}\n- **HORIZONTE:** ${horizonLabel} (${duration} dias / ${totalWeeks} semanas)${ragContext}\n\n**PERIODIZAÇÃO:** ${periodizationGuidance}\n\nRetorne JSON com EXATAMENTE ${sessionsPerWeek} sessões.\n{"resumoExecutivo":"...","dicasFinais":"...","dias":[{"dia":1,"titulo":"...","duracaoMinutos":${sessionMinutes},"intensidade":"Alta","descricaoCompleta":"..."}]}`;
    let skeleton: AiJson;
    try {
      skeleton = await this.callAI(
        [{ role: 'system', content: 'Você é um planejador de periodização esportiva. Gere JSON rigoroso.' }, { role: 'user', content: skeletonPrompt }],
        Math.min(2000, Math.max(400, sessionsPerWeek * 200)),
        aiProvider,
        geminiModel,
      );
    } catch (e: any) {
      if (e?.status === 429) throw e;
      const isAuth = e?.status === 401 || e?.error?.code === 'invalid_api_key';
      if (process.env.NODE_ENV !== 'production' && isAuth) {
        this.logger.warn('[AI] GROQ_API_KEY inválida — fallback mock');
        return { resumoExecutivo: `Plano mock para ${targetName} (${duration} dias)`, dicasFinais: 'Mock — fallback', dias: [{ dia: 1, titulo: 'Sessão Mock', duracaoMinutos: 60, intensidade: 'Média', descricaoCompleta: 'Treino mock', exercicios: [] }] };
      }
      throw e;
    }
    if (!skeleton?.dias || !Array.isArray(skeleton.dias)) throw new Error('Fase 1 (skeleton) retornou JSON inválido');
    const weekTemplate = skeleton.dias.slice(0, sessionsPerWeek);
    const batchPrompt = `Você tem uma biblioteca de exercícios. Selecione EXCLUSIVAMENTE destes IDs (há ${availableExercises.length} exercício(s)):\n${exercisesListText}\n\nSESSÕES (${weekTemplate.length}):\n${weekTemplate.map((d) => `Sessão ${d.dia}: ${d.titulo} — ${d.descricaoCompleta}`).join('\n')}\n\nPERFIL: ${targetName} | ${profile?.position ?? 'N/A'} | ${profile?.technicalLevel ?? 'N/A'}\nLESÕES: ${this.sanitizeForPrompt(profile?.currentInjuries as string, 150) || 'Nenhuma'}${injuryNote}\n\nREGRAS: 1) EXATAMENTE ${exPerSession} por sessão, 2) Não repita exerciseId na mesma sessão, 3) exerciseId válido, 4) fases aquecimento/principal/volta_a_calma\nRetorne {"dias":[{"dia":<n>,"exercicios":[{"exerciseId":"ID","phase":"aquecimento|principal|volta_a_calma","sets":3,"reps":"10","restSeconds":60,"notes":"...","completed":false}]}]}`;
    try {
      const batchResult = await this.callAI(
        [{ role: 'system', content: 'Você é assistente de prescrição. Responda em JSON rigoroso, usando APENAS IDs fornecidos.' }, { role: 'user', content: batchPrompt }],
        Math.min(3000, weekTemplate.length * exPerSession * 120),
        aiProvider,
        geminiModel,
      );
      if (batchResult?.dias && Array.isArray(batchResult.dias)) {
        batchResult.dias.forEach((bd: any) => {
          const target = weekTemplate.find((d) => d.dia === bd.dia);
          if (target) target.exercicios = bd.exercicios ?? [];
        });
      }
    } catch (e: any) {
      if ((e?.status ?? e?.statusCode) === 429) throw new Error('Limite de tokens atingido. Tente novamente em alguns minutos.');
      this.logger.error('[AI] Batch falhou', (e as Error).message);
      weekTemplate.forEach((d) => { if (!d.exercicios) d.exercicios = []; });
    }
    // Replicação + rotação + sobrecarga (portado do legado)
    const exercisePool = new Map<string, any[]>();
    for (const ex of availableExercises) {
      const key = `${ex.category}|${ex.difficulty}`;
      if (!exercisePool.has(key)) exercisePool.set(key, []);
      exercisePool.get(key)!.push(ex);
    }
    function buildRotatedSession(session: any, weekNum: number): any {
      const rotated = (session.exercicios ?? []).map((ex: any) => {
        const key = `${ex.category ?? ''}|${ex.difficulty ?? ''}`;
        const pool = exercisePool.get(key);
        let r = ex;
        if (pool && pool.length > 1) {
          const curIdx = pool.findIndex((p) => p.id === ex.exerciseId);
          const startIdx = curIdx >= 0 ? curIdx : 0;
          const nextIdx = (startIdx + weekNum) % pool.length;
          const sub = pool[nextIdx];
          if (sub && sub.id !== ex.exerciseId) r = { ...ex, exerciseId: sub.id, name: sub.name, category: sub.category, difficulty: sub.difficulty, videoUrl: sub.videoUrl ?? null };
        }
        const incSets = Math.min(3, Math.floor(weekNum / 2));
        const baseSets = parseInt(String(r.sets)) || 3;
        const newSets = baseSets + incSets;
        const repsStr = String(r.reps ?? '10');
        const repsNum = parseInt(repsStr);
        const isNum = !isNaN(repsNum) && String(repsNum) === repsStr.trim();
        const repsInc = Math.min(4, Math.floor(weekNum / 2) * 2);
        const newReps = isNum ? String(repsNum + repsInc) : repsStr;
        return { ...r, sets: newSets, reps: newReps };
      });
      return { ...session, exercicios: rotated };
    }
    const totalSessionsNeeded = Math.max(1, Math.round((duration / 7) * sessionsPerWeek));
    const spacing = Math.max(1, Math.round(7 / sessionsPerWeek));
    const allDias: any[] = [];
    for (let i = 0; i < totalSessionsNeeded; i++) {
      const template = weekTemplate[i % weekTemplate.length];
      const weekNum = Math.floor(i / weekTemplate.length);
      const actualDay = weekNum * 7 + (i % weekTemplate.length) * spacing + 1;
      allDias.push({ ...buildRotatedSession(template, weekNum), dia: actualDay });
    }
    return { resumoExecutivo: skeleton.resumoExecutivo ?? '', dicasFinais: skeleton.dicasFinais ?? '', dias: allDias };
  }
}
