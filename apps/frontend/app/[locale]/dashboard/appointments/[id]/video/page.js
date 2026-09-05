'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, ArrowLeft, Video, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'

/**
 * Chamada Online (fatia 37, frontend).
 *
 * Busca a sala via BFF (`GET /api/backend/appointments/:id/video` — só
 * participante):
 * - Daily: embute o Prebuilt em iframe (sem limite de 5 min).
 * - Jitsi próprio: embute via `external_api.js` com `userInfo`.
 * - Jitsi público (meet.jit.si): NÃO embute — o embed demo cai em 5 min.
 *   Mostra cartão com abertura em nova guia. Moderação: quem entra primeiro.
 */
export default function VideoCallPage() {
    const params = useParams()
    const router = useRouter()
    const { data: session, status } = useSession()
    const id = params.id
    const containerRef = useRef(null)
    const apiRef = useRef(null)

    const [sala, setSala] = useState(null)
    const [loading, setLoading] = useState(true)
    const [erro, setErro] = useState(null)

    useEffect(() => {
        if (status === 'loading') return
        if (!session) { router.push('/'); return }
        let cancelado = false
        fetch(`/api/backend/appointments/${id}/video`)
            .then(async (res) => {
                const data = await res.json().catch(() => ({}))
                if (cancelado) return
                if (!res.ok) throw new Error(data.error || 'Sala não encontrada')
                setSala(data)
            })
            .catch((e) => { if (!cancelado) setErro(e.message) })
            .finally(() => { if (!cancelado) setLoading(false) })
        return () => { cancelado = true }
    }, [id, session, status, router])

    const dominioSala = sala ? extrairDominio(sala.joinUrl) : ''
    const ehJitsiPublico = sala?.provider === 'jitsi' && dominioSala === 'meet.jit.si'

    useEffect(() => {
        if (!sala || sala.provider !== 'jitsi' || ehJitsiPublico) return
        const montar = () => {
            if (!containerRef.current || !window.JitsiMeetExternalAPI) return
            apiRef.current?.dispose?.()
            apiRef.current = new window.JitsiMeetExternalAPI(extrairDominio(sala.joinUrl), {
                roomName: sala.roomName,
                parentNode: containerRef.current,
                width: '100%',
                height: 640,
                userInfo: {
                    displayName: session?.user?.name ?? 'Participante',
                    email: session?.user?.email ?? undefined,
                },
                configOverwrite: { prejoinPageEnabled: true },
            })
        }
        if (window.JitsiMeetExternalAPI) { montar(); return }
        const script = document.createElement('script')
        script.src = `https://${extrairDominio(sala.joinUrl)}/external_api.js`
        script.async = true
        script.onload = montar
        script.onerror = () => toast.error('Falha ao carregar o Jitsi')
        document.head.appendChild(script)
        return () => { apiRef.current?.dispose?.(); apiRef.current = null }
    }, [sala, session, ehJitsiPublico])

    if (loading || status === 'loading') {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        )
    }

    if (erro || !sala) {
        return (
            <div className="max-w-lg mx-auto py-16">
                <Card>
                    <CardHeader>
                        <CardTitle>Chamada indisponível</CardTitle>
                        <CardDescription>{erro ?? 'Sala de vídeo não gerada para este agendamento.'}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button variant="outline" onClick={() => router.push('/dashboard/appointments')}>
                            <ArrowLeft className="w-4 h-4 mr-2" /> Voltar para agendamentos
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => router.push('/dashboard/appointments')}>
                        <ArrowLeft className="w-4 h-4 mr-1" /> Agendamentos
                    </Button>
                    <span className="text-sm text-gray-500">
                        Chamada Online · {sala.provider === 'daily' ? 'Daily' : 'Jitsi'} · {sala.roomName}
                    </span>
                </div>
                <Button variant="outline" size="sm" asChild>
                    <a href={sala.joinUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4 mr-1" /> Abrir em nova aba
                    </a>
                </Button>
            </div>

            {ehJitsiPublico ? (
                <Card>
                    <CardHeader>
                        <CardTitle>Abrir Chamada Online</CardTitle>
                        <CardDescription>
                            O embed do meet.jit.si é demonstração e cai em 5 minutos. Abra em nova guia para a chamada completa. Quem entrar primeiro assume a moderação.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                        <Button asChild className="bg-blue-600 hover:bg-blue-700">
                            <a href={sala.joinUrl} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="w-4 h-4 mr-1" /> Entrar na chamada em nova guia
                            </a>
                        </Button>
                        <Button variant="outline" onClick={() => navigator.clipboard.writeText(sala.joinUrl).then(() => toast.success('Link copiado!'))}>
                            Copiar link
                        </Button>
                    </CardContent>
                </Card>
            ) : sala.provider === 'jitsi' ? (
                <div ref={containerRef} className="w-full rounded-xl overflow-hidden border bg-black min-h-[640px]" />
            ) : (
                <div className="rounded-xl overflow-hidden border bg-black">
                    <iframe
                        title="Chamada Online"
                        src={sala.joinUrl}
                        allow="camera; microphone; fullscreen; display-capture; autoplay"
                        className="w-full min-h-[640px]"
                    />
                </div>
            )}

            <p className="text-xs text-gray-500 flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5" />
                Entrando como {session?.user?.name ?? session?.user?.email ?? 'participante'}.
                Somente participantes do agendamento têm acesso.
            </p>
        </div>
    )
}

function extrairDominio(joinUrl) {
    try {
        return new URL(joinUrl).host
    } catch {
        return 'meet.jit.si'
    }
}
