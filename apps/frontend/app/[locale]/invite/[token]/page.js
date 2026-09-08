'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession, signIn } from 'next-auth/react'
import { Loader2, CheckCircle2, XCircle, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'

export default function InvitePage() {
    const params = useParams()
    const router = useRouter()
    const { data: session, status } = useSession()
    const [invite, setInvite] = useState(null)
    const [loading, setLoading] = useState(true)
    const [accepting, setAccepting] = useState(false)
    const [error, setError] = useState(null)
    const [accepted, setAccepted] = useState(false)

    useEffect(() => {
        fetchInvite()
    }, [params.token])

    const fetchInvite = async () => {
        try {
            const res = await fetch(`/api/backend/invite/${params.token}`)
            if (!res.ok) {
                const data = await res.json()
                setError(data.error || 'Convite inválido ou expirado')
                return
            }
            const data = await res.json()
            setInvite(data.invite)
        } catch {
            setError('Erro ao carregar convite')
        } finally {
            setLoading(false)
        }
    }

    const handleAccept = async () => {
        if (!session) {
            // Save token and redirect to sign in
            signIn('google', { callbackUrl: `/invite/${params.token}` })
            return
        }

        setAccepting(true)
        try {
            const res = await fetch(`/api/backend/invite/${params.token}`, {
                method: 'POST',
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Erro ao aceitar convite')
            setAccepted(true)
            toast.success('Convite aceito com sucesso!')
            setTimeout(() => router.push('/dashboard'), 2000)
        } catch (err) {
            toast.error(err.message)
        } finally {
            setAccepting(false)
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <Loader2 className="w-8 h-8 animate-spin text-green-600" />
            </div>
        )
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-green-600 rounded-2xl mb-4">
                        <span className="text-3xl">⚽</span>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-900">Player.Action</h1>
                    <p className="text-gray-500 text-sm mt-1">Plataforma de Treinos com IA</p>
                </div>

                <Card>
                    {error ? (
                        <>
                            <CardHeader className="text-center">
                                <XCircle className="w-12 h-12 text-red-500 mx-auto mb-2" />
                                <CardTitle className="text-red-700">Convite inválido</CardTitle>
                                <CardDescription>{error}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button className="w-full" variant="outline" onClick={() => router.push('/')}>
                                    Ir para a página inicial
                                </Button>
                            </CardContent>
                        </>
                    ) : accepted ? (
                        <>
                            <CardHeader className="text-center">
                                <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-2" />
                                <CardTitle className="text-green-700">Convite aceito! 🎉</CardTitle>
                                <CardDescription>Você foi conectado ao treinador. Redirecionando...</CardDescription>
                            </CardHeader>
                        </>
                    ) : invite ? (
                        <>
                            <CardHeader className="text-center">
                                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <Users className="w-7 h-7 text-green-600" />
                                </div>
                                <CardTitle>Convite de Treinador</CardTitle>
                                <CardDescription>
                                    <strong>{invite.trainerName}</strong> te convidou para treinar juntos no Player.Action
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                                    <p className="text-sm text-green-800">
                                        Ao aceitar, seu treinador poderá criar planos de treino personalizados com IA especialmente para você.
                                    </p>
                                </div>

                                {!session && (
                                    <p className="text-xs text-center text-gray-500">
                                        Você precisará entrar com o Google para aceitar o convite.
                                    </p>
                                )}

                                <Button
                                    className="w-full bg-green-600 hover:bg-green-700"
                                    onClick={handleAccept}
                                    disabled={accepting}
                                >
                                    {accepting ? (
                                        <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Aceitando...</>
                                    ) : session ? (
                                        <><CheckCircle2 className="w-4 h-4 mr-2" /> Aceitar Convite</>
                                    ) : (
                                        'Entrar com Google e Aceitar'
                                    )}
                                </Button>
                            </CardContent>
                        </>
                    ) : null}
                </Card>
            </div>
        </div>
    )
}
