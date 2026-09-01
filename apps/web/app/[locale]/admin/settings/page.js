'use client'

import { useState, useEffect } from 'react'
import { Settings, Save, Loader2, AlertCircle, ToggleLeft, ToggleRight, Info, Video, Cloud, Coins, Palette, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select"

export default function AdminSettingsPage() {
    const [settings, setSettings] = useState(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [v3Tab, setV3Tab] = useState('r2') // 'r2' | 'cloudinary'

    useEffect(() => { fetchSettings() }, [])

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/backend/admin/settings')
            if (!res.ok) throw new Error('Falha ao carregar configurações.')
            const data = await res.json()
            setSettings(data)
            // Open the tab matching current provider
            setV3Tab(data.storageProvider === 'cloudinary' ? 'cloudinary' : 'r2')
        } catch (error) {
            toast.error(error.message)
        } finally {
            setLoading(false)
        }
    }

    const handleToggle = (field) => setSettings(prev => ({ ...prev, [field]: !prev[field] }))
    const handleChange = (e) => {
        const { name, value } = e.target
        setSettings(prev => ({ ...prev, [name]: value }))
    }
    const handleSelect = (field, value) => setSettings(prev => ({ ...prev, [field]: value }))

    const handleSave = async () => {
        setSaving(true)
        try {
            const res = await fetch('/api/backend/admin/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            })
            if (!res.ok) throw new Error('Falha ao salvar configurações.')
            toast.success('Configurações atualizadas com sucesso!')
            // Invalida cache do ThemeProvider para o tema ser aplicado imediatamente
            sessionStorage.removeItem('pa_ui_theme')
            setTimeout(() => window.location.reload(), 1000)
        } catch (error) {
            toast.error(error.message)
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="flex h-[400px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-green-500" />
            </div>
        )
    }

    return (
        <div className="space-y-6 max-w-4xl">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Settings className="w-6 h-6 text-green-600" />
                        Configurações Globais e Feature Flags
                    </h1>
                    <p className="text-slate-500 mt-1">
                        Ative ou desative módulos inteiros da plataforma e defina taxas base.
                    </p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-2.5 rounded-xl font-medium transition-all disabled:opacity-50"
                >
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    Salvar Alterações
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Módulos do Sistema */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
                    <h2 className="text-lg font-semibold text-slate-800 border-b pb-4">Módulos da Plataforma (Feature Flags)</h2>
                    <div className="space-y-5">
                        <ToggleRow
                            label="Módulo Atleta Independente"
                            description="Permite que usuários treinem sozinhos usando a IA."
                            checked={settings.moduleAthleteEnabled}
                            onToggle={() => handleToggle('moduleAthleteEnabled')}
                            color="green"
                        />
                        <ToggleRow
                            label="Módulo Treinador Padrão"
                            description="Fluxo tradicional de SaaS pago pelo Treinador."
                            checked={settings.moduleCoachEnabled}
                            onToggle={() => handleToggle('moduleCoachEnabled')}
                            color="slate"
                        />
                        <ToggleRow
                            label="Módulo Parceiro B2B"
                            description="Treinadores vendem planos e dividem a receita (MVP)."
                            checked={settings.modulePartnerB2BEnabled}
                            onToggle={() => handleToggle('modulePartnerB2BEnabled')}
                            color="green"
                            highlight="green"
                        />
                        <ToggleRow
                            label="Módulo Afiliados"
                            description="Permite indicação de parceiros com comissão automática via Stripe."
                            tooltip="Exibe o card 'Sou Afiliado' na homepage e habilita o programa de indicações."
                            checked={settings.moduleAffiliateEnabled}
                            onToggle={() => handleToggle('moduleAffiliateEnabled')}
                            color="purple"
                        />
                    </div>
                </div>

                {/* Regras B2B */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
                    <h2 className="text-lg font-semibold text-slate-800 border-b pb-4">Regras do Programa Parceiros</h2>
                    <div className="space-y-5">
                        <ToggleRow
                            label="Aprovação Automática de Parceiros"
                            description="Aceita automaticamente quem se propõe a ser parceiro."
                            tooltip="Se ativo, cria conta Stripe Connect na hora do clique."
                            checked={settings.autoApprovePartners}
                            onToggle={() => handleToggle('autoApprovePartners')}
                            color="blue"
                        />
                        <ToggleRow
                            label="Troca de Tier Automática"
                            description="Parceiros trocam de tier instantaneamente, sem aprovação manual."
                            tooltip="Se desativado, a troca de tier cria uma solicitação pendente que o admin precisa aprovar em Parceiros B2B."
                            checked={settings.autoApproveTierChange}
                            onToggle={() => handleToggle('autoApproveTierChange')}
                            color="blue"
                        />
                        <ToggleRow
                            label="Exclusividade de Esporte"
                            description="Permite múltiplos treinadores para um mesmo esporte."
                            tooltip="Se desativo, barra alunos de aceitarem convites de novos treinadores para o mesmo esporte."
                            checked={settings.allowMultipleTrainersPerSport}
                            onToggle={() => handleToggle('allowMultipleTrainersPerSport')}
                            color="purple"
                        />
                        <ToggleRow
                            label="Modo Teste B2B (Sandbox)"
                            description="Habilita períodos de cortesia para alunos."
                            tooltip="Permite que treinadores ofereçam 30 dias de teste grátis nos seus planos."
                            checked={settings.enableB2BTestMode}
                            onToggle={() => handleToggle('enableB2BTestMode')}
                            color="orange"
                            highlight="orange"
                        />
                    </div>
                </div>

                {/* ── Armazenamento de Vídeo ────────────────────────────────── */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4 md:col-span-2">
                    <h2 className="text-lg font-semibold text-slate-800 border-b pb-4 flex items-center gap-2">
                        <Cloud className="w-5 h-5 text-orange-500" />
                        Provedor de Armazenamento de Vídeo
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* R2 card */}
                        <button
                            type="button"
                            onClick={() => handleSelect('storageProvider', 'r2')}
                            className={`flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                                settings.storageProvider === 'r2'
                                    ? 'border-orange-400 bg-orange-50'
                                    : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                            }`}
                        >
                            <div className="text-2xl mt-0.5">☁️</div>
                            <div>
                                <h3 className={`font-semibold ${settings.storageProvider === 'r2' ? 'text-orange-800' : 'text-slate-700'}`}>
                                    Cloudflare R2
                                    {settings.storageProvider === 'r2' && (
                                        <span className="ml-2 text-xs bg-orange-200 text-orange-800 px-2 py-0.5 rounded-full">Ativo</span>
                                    )}
                                </h3>
                                <p className="text-sm text-slate-500 mt-0.5">
                                    Padrão · HLS gerado pelo browser (FFmpeg WASM) · Sem custo de egress · Presigned URLs seguras
                                </p>
                            </div>
                        </button>

                        {/* Cloudinary card */}
                        <button
                            type="button"
                            onClick={() => handleSelect('storageProvider', 'cloudinary')}
                            className={`flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                                settings.storageProvider === 'cloudinary'
                                    ? 'border-blue-400 bg-blue-50'
                                    : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                            }`}
                        >
                            <div className="text-2xl mt-0.5">📷</div>
                            <div>
                                <h3 className={`font-semibold ${settings.storageProvider === 'cloudinary' ? 'text-blue-800' : 'text-slate-700'}`}>
                                    Cloudinary
                                    {settings.storageProvider === 'cloudinary' && (
                                        <span className="ml-2 text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full">Ativo</span>
                                    )}
                                </h3>
                                <p className="text-sm text-slate-500 mt-0.5">
                                    Legado · Transformações on-the-fly · Cobra por bandwidth
                                </p>
                            </div>
                        </button>
                    </div>

                    {settings.storageProvider === 'cloudinary' && (
                        <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-800">
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>
                                Cloudinary é cobrado por bandwidth de entrega.
                                Recomendamos manter o <strong>Cloudflare R2</strong> como padrão.
                            </span>
                        </div>
                    )}
                </div>

                {/* ── Provedor de IA para Planos de Treino ─────────────────────────── */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4 md:col-span-2">
                    <h2 className="text-lg font-semibold text-slate-800 border-b pb-4 flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-purple-500" />
                        Provedor de IA para Geração de Planos
                    </h2>
                    <p className="text-sm text-slate-500">
                        Escolha qual IA é usada ao gerar planos de treino. O Groq é mais rápido; o Gemini tem menor custo por token.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Groq card */}
                        <button
                            type="button"
                            onClick={() => handleSelect('aiProvider', 'groq')}
                            className={`flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                                (settings.aiProvider === 'groq' || !settings.aiProvider)
                                    ? 'border-purple-400 bg-purple-50'
                                    : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                            }`}
                        >
                            <div className="text-2xl mt-0.5">⚡️</div>
                            <div>
                                <h3 className={`font-semibold ${
                                    (settings.aiProvider === 'groq' || !settings.aiProvider) ? 'text-purple-800' : 'text-slate-700'
                                }`}>
                                    Groq (Llama 3.3 70B)
                                    {(settings.aiProvider === 'groq' || !settings.aiProvider) && (
                                        <span className="ml-2 text-xs bg-purple-200 text-purple-800 px-2 py-0.5 rounded-full">Ativo</span>
                                    )}
                                </h3>
                                <p className="text-sm text-slate-500 mt-0.5">
                                    Padrão · Ultra-rápido (LPU) · 100k tokens free/dia · Fallback automático para IA local
                                </p>
                                <p className="text-xs text-slate-400 mt-1">Requer: <code>GROQ_API_KEY</code></p>
                            </div>
                        </button>

                        {/* Gemini card */}
                        <button
                            type="button"
                            onClick={() => handleSelect('aiProvider', 'gemini')}
                            className={`flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                                settings.aiProvider === 'gemini'
                                    ? 'border-blue-400 bg-blue-50'
                                    : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                            }`}
                        >
                            <div className="text-2xl mt-0.5">💎</div>
                            <div>
                                <h3 className={`font-semibold ${
                                    settings.aiProvider === 'gemini' ? 'text-blue-800' : 'text-slate-700'
                                }`}>
                                    Google Gemini 2.0 Flash
                                    {settings.aiProvider === 'gemini' && (
                                        <span className="ml-2 text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full">Ativo</span>
                                    )}
                                </h3>
                                <p className="text-sm text-slate-500 mt-0.5">
                                    ~3× mais barato que Groq · JSON mode nativo · 1M tokens de contexto
                                </p>
                                <p className="text-xs text-slate-400 mt-1">Requer: <code>GEMINI_API_KEY</code></p>
                            </div>
                        </button>
                    </div>

                    {settings.aiProvider === 'gemini' && (
                        <div className="space-y-3">
                            <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
                                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                <span>Adicione <strong>GEMINI_API_KEY</strong> no seu <code>.env</code>. Obtenha gratuitamente em <a href="https://aistudio.google.com" target="_blank" rel="noreferrer" className="underline font-medium">Google AI Studio</a>.</span>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-slate-600">Modelo Gemini</label>
                                <select
                                    value={settings.geminiModel || 'gemini-2.0-flash'}
                                    onChange={(e) => handleSelect('geminiModel', e.target.value)}
                                    className="w-full md:w-64 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                                >
                                    <option value="gemini-2.0-flash">gemini-2.0-flash (Recomendado)</option>
                                    <option value="gemini-2.0-flash-lite">gemini-2.0-flash-lite (Mais barato)</option>
                                    <option value="gemini-1.5-flash">gemini-1.5-flash (Legado)</option>
                                </select>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Experiência de Treino e Mídia (V3) — Abas ───────────── */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5 md:col-span-2">
                    <h2 className="text-lg font-semibold text-slate-800 border-b pb-4 flex items-center gap-2">
                        <Video className="w-5 h-5 text-blue-600" />
                        Experiência de Treino e Mídia (V3)
                    </h2>

                    {/* Tab switcher */}
                    <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
                        <TabButton
                            active={v3Tab === 'r2'}
                            onClick={() => setV3Tab('r2')}
                            icon="☁️"
                            label="Cloudflare R2"
                        />
                        <TabButton
                            active={v3Tab === 'cloudinary'}
                            onClick={() => setV3Tab('cloudinary')}
                            icon="📷"
                            label="Cloudinary (Legado)"
                        />
                    </div>

                    {/* R2 Tab */}
                    {v3Tab === 'r2' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-3">
                                <div>
                                    <h3 className="font-semibold text-slate-700">Preview de Vídeo (Hover)</h3>
                                    <p className="text-sm text-slate-500">
                                        Reproduz vídeo mudo ao passar o mouse — funciona via HLS no R2.
                                    </p>
                                </div>
                                <ToggleRow
                                    label=""
                                    description=""
                                    checked={settings.enableVideoHoverPreview}
                                    onToggle={() => handleToggle('enableVideoHoverPreview')}
                                    color="green"
                                    compact
                                />
                            </div>

                            <div className="p-4 bg-orange-50 rounded-xl border border-orange-100 space-y-2">
                                <h3 className="font-semibold text-orange-800 flex items-center gap-2">
                                    ☁️ Cloudflare R2 ativo
                                </h3>
                                <p className="text-sm text-orange-700">
                                    Vídeos são servidos via <strong>presigned URLs</strong> (2h de validade).
                                    HLS fragmentado por padrão. Download direto bloqueado.
                                </p>
                                <p className="text-xs text-orange-500 mt-1">
                                    Vídeos de mobile ficam em fila HLS — use o{' '}
                                    <a href="/admin/video-processor" className="underline font-medium">Processador de Vídeos</a>
                                    {' '}para converter.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Cloudinary Tab */}
                    {v3Tab === 'cloudinary' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                                <div>
                                    <h3 className="font-semibold text-slate-700">Preview de Vídeo (Hover)</h3>
                                    <p className="text-sm text-slate-500">Reproduz vídeo mudo ao passar o mouse sobre o exercício.</p>
                                </div>
                                <button onClick={() => handleToggle('enableVideoHoverPreview')} className="text-slate-400 focus:outline-none">
                                    {settings.enableVideoHoverPreview
                                        ? <ToggleRight className="w-10 h-10 text-green-500" />
                                        : <ToggleLeft className="w-10 h-10" />}
                                </button>
                            </div>

                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-3">
                                <div>
                                    <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                                        Estratégia de Preview
                                        <Tip content="TEASER: Carrega apenas 10s em baixa resolução (Economia). FULL: Carrega o vídeo todo com compressão (Banda alta)." />
                                    </h3>
                                    <p className="text-sm text-slate-500">Define como o vídeo é entregue no hover.</p>
                                </div>
                                <Select
                                    value={settings.videoHoverType}
                                    onValueChange={(val) => handleSelect('videoHoverType', val)}
                                >
                                    <SelectTrigger className="w-full bg-white">
                                        <SelectValue placeholder="Selecione a estratégia" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="TEASER">Opção A: Teaser (10 segundos + Econômico)</SelectItem>
                                        <SelectItem value="FULL">Opção B: Vídeo Completo (Alta Compressão)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Sistema de Créditos ──────────────────────────────────── */}
                <div className="bg-yellow-50 rounded-2xl p-6 border border-yellow-200 shadow-sm md:col-span-2 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Coins className="w-6 h-6 text-yellow-600 shrink-0" />
                        <div>
                            <h3 className="font-semibold text-yellow-900">Sistema de Créditos</h3>
                            <p className="text-sm text-yellow-700">Configure pacotes, custos por feature e gerencie créditos em uma página dedicada.</p>
                        </div>
                    </div>
                    <a href="/admin/credits" className="shrink-0 bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-all">
                        Gerenciar →
                    </a>
                </div>

                {/* ── Tema Visual da Plataforma ─────────────────────────────── */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4 md:col-span-2">
                    <h2 className="text-lg font-semibold text-slate-800 border-b pb-4 flex items-center gap-2">
                        <Palette className="w-5 h-5 text-indigo-500" />
                        Tema Visual da Plataforma
                    </h2>
                    <p className="text-sm text-slate-500">
                        Escolha a aparência aplicada globalmente. O novo tema entra em vigor após salvar e recarregar.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                        {/* Light Theme */}
                        <button
                            type="button"
                            onClick={() => handleSelect('uiTheme', 'light')}
                            className={`flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                                (settings.uiTheme === 'light' || !settings.uiTheme)
                                    ? 'border-slate-400 bg-slate-50 shadow-md'
                                    : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                            }`}
                        >
                            <div className="flex-shrink-0 w-14 h-14 rounded-lg border border-slate-200 overflow-hidden grid grid-cols-2 grid-rows-2">
                                <div className="bg-white" />
                                <div className="bg-gray-100" />
                                <div className="bg-green-500" />
                                <div className="bg-gray-200" />
                            </div>
                            <div>
                                <h3 className={`font-semibold ${(settings.uiTheme === 'light' || !settings.uiTheme) ? 'text-slate-900' : 'text-slate-600'}`}>
                                    ☀️ Claro (Padrão)
                                    {(settings.uiTheme === 'light' || !settings.uiTheme) && (
                                        <span className="ml-2 text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">Ativo</span>
                                    )}
                                </h3>
                                <p className="text-sm text-slate-500 mt-0.5">
                                    Interface clara com fundo branco e accent verde.
                                </p>
                            </div>
                        </button>

                        {/* Dark Blue Theme */}
                        <button
                            type="button"
                            onClick={() => handleSelect('uiTheme', 'dark-blue')}
                            className={`flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                                settings.uiTheme === 'dark-blue'
                                    ? 'border-indigo-400 shadow-md'
                                    : 'border-slate-700 hover:border-slate-500'
                            }`}
                            style={{ background: settings.uiTheme === 'dark-blue' ? '#0f1623' : '#111827' }}
                        >
                            <div className="flex-shrink-0 w-14 h-14 rounded-lg border border-slate-600 overflow-hidden grid grid-cols-2 grid-rows-2">
                                <div style={{ background: '#0f1623' }} />
                                <div style={{ background: '#141d2b' }} />
                                <div style={{ background: '#22c55e' }} />
                                <div style={{ background: '#1e2d42' }} />
                            </div>
                            <div>
                                <h3 className={`font-semibold ${settings.uiTheme === 'dark-blue' ? 'text-indigo-300' : 'text-slate-300'}`}>
                                    🌙 Dark Blue
                                    {settings.uiTheme === 'dark-blue' && (
                                        <span className="ml-2 text-xs bg-indigo-900 text-indigo-300 px-2 py-0.5 rounded-full">Ativo</span>
                                    )}
                                </h3>
                                <p className="text-sm text-slate-400 mt-0.5">
                                    Azul profundo com accent verde. Ideal para ambientes escuros.
                                </p>
                            </div>
                        </button>
                    </div>
                </div>

            </div>
        </div>
    )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ToggleRow({ label, description, tooltip, checked, onToggle, color = 'green', highlight, compact }) {
    const colorMap = {
        green:  'text-green-500',
        blue:   'text-blue-500',
        purple: 'text-purple-500',
        orange: 'text-orange-500',
        slate:  'text-slate-500',
    }
    const highlightMap = {
        green:  'bg-green-50 border-green-100',
        orange: 'bg-orange-50 border-orange-100',
    }
    const bg = highlight ? highlightMap[highlight] : 'bg-slate-50 border-slate-100'

    if (compact) {
        return (
            <button onClick={onToggle} className="focus:outline-none">
                {checked
                    ? <ToggleRight className={`w-10 h-10 ${colorMap[color]}`} />
                    : <ToggleLeft className="w-10 h-10 text-slate-300" />}
            </button>
        )
    }

    return (
        <div className={`flex items-center justify-between p-4 rounded-xl border ${bg}`}>
            <div>
                <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                    {label}
                    {tooltip && <Tip content={tooltip} />}
                </h3>
                {description && <p className="text-sm text-slate-500">{description}</p>}
            </div>
            <button onClick={onToggle} className="text-slate-400 focus:outline-none">
                {checked
                    ? <ToggleRight className={`w-10 h-10 ${colorMap[color]}`} />
                    : <ToggleLeft className="w-10 h-10" />}
            </button>
        </div>
    )
}

function TabButton({ active, onClick, icon, label }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                active ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
            }`}
        >
            <span>{icon}</span>
            {label}
        </button>
    )
}

function Tip({ content }) {
    return (
        <div className="group relative inline-block">
            <Info className="w-4 h-4 text-slate-400" />
            <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-xs rounded py-1 px-2 absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 text-center pointer-events-none z-10">
                {content}
                <svg className="absolute text-slate-800 h-2 w-full left-0 top-full" x="0px" y="0px" viewBox="0 0 255 255"><polygon className="fill-current" points="0,0 127.5,127.5 255,0" /></svg>
            </div>
        </div>
    )
}

