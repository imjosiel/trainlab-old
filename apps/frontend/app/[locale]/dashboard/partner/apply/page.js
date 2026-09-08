'use client'

import { ROLES } from '@/lib/constants'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import TermsCheckbox from '@/components/terms-checkbox'
import { useSession } from 'next-auth/react'
import {
    Loader2,
    CheckCircle2,
    Clock,
    AlertCircle,
    Rocket,
    DollarSign,
    Users,
    ShieldCheck
} from "lucide-react"

export default function PartnerApplicationPage() {
    const { data: session } = useSession()
    const router = useRouter()

    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [accountStatus, setAccountStatus] = useState(null)
    const [motivation, setMotivation] = useState("")
    const [termsAccepted, setTermsAccepted] = useState(false)

    useEffect(() => {
        async function fetchPartnerStatus() {
            try {
                // Em um cenário real, você teria um endpoint GET /api/backend/partner/status
                // Como não temos ainda, vamos abstrair ou buscar junto com os dados do usuário.
                // Para este MVP, se a API retornar erro no POST dizendo que já existe, sabemos o status.
                // Vamos simular a busca pelo status direto do banco de dados chamando uma rota de profile segura

                const res = await fetch('/api/backend/user/profile')
                const data = await res.json()

                if (data.partnerAccount) {
                    setAccountStatus(data.partnerAccount)
                }
            } catch (error) {
                console.error("Erro ao verificar status:", error)
            } finally {
                setLoading(false)
            }
        }

        fetchPartnerStatus()
    }, [])

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!termsAccepted) return

        if (motivation.trim().length < 20) {
            toast.error("Por favor, explique com mais detalhes por que você quer se tornar um parceiro (mínimo 20 caracteres).")
            return
        }

        setSubmitting(true)
        try {
            const res = await fetch('/api/backend/partner/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ motivation }),
            })

            const data = await res.json()

            if (res.ok) {
                toast.success("Candidatura enviada com sucesso! 🚀")
                setAccountStatus(data.account)
                setMotivation("")
            } else {
                throw new Error(data.error || "Erro ao enviar candidatura.")
            }
        } catch (error) {
            toast.error(error.message)
        } finally {
            setSubmitting(false)
        }
    }

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-green-600" />
            </div>
        )
    }

    // Se já foi aprovado
    const systemRoles = session?.user?.systemRoles || []
    if (session?.user?.roles?.includes(ROLES.PARTNER) || accountStatus?.status === 'approved') {

        // Verifica se completou o KYC do Stripe
        if (!accountStatus?.payoutsEnabled || !accountStatus?.chargesEnabled) {
            return (
                <div className="max-w-2xl mx-auto mt-8">
                    <Card className="border-amber-200 bg-amber-50">
                        <CardHeader className="text-center pb-2">
                            <div className="mx-auto w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mb-4">
                                <AlertCircle className="w-6 h-6 text-amber-600" />
                            </div>
                            <CardTitle className="text-2xl text-amber-900">Configure seus Recebimentos</CardTitle>
                            <CardDescription>
                                Sua candidatura foi aprovada, mas você ainda precisa configurar sua conta no Stripe.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="text-center text-gray-700 pt-4">
                            <p>Para começar a criar ofertas e receber pagamentos, precisamos verificar sua identidade e configurar seus dados bancários oficiais.</p>
                        </CardContent>
                        <CardFooter className="flex justify-center pt-6">
                            <Button onClick={() => router.push('/dashboard/partner/onboarding')} className="bg-amber-600 hover:bg-amber-700">
                                Iniciar Configuração Bancária
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            )
        }

        // Parceiro 100% ativo
        return (
            <div className="max-w-2xl mx-auto mt-8">
                <Card className="border-green-200 bg-green-50/30">
                    <CardHeader className="text-center pb-2">
                        <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
                            <CheckCircle2 className="w-6 h-6 text-green-600" />
                        </div>
                        <CardTitle className="text-2xl text-green-900">Parceiro Aprovado!</CardTitle>
                        <CardDescription>
                            Bem-vindo ao programa Player.Action Partners.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="text-center text-gray-600 pt-4">
                        <p>Você já está habilitado para vender seus planos e serviços diretamente pela nossa plataforma.</p>
                    </CardContent>
                    <CardFooter className="flex justify-center pt-6">
                        <Button onClick={() => router.push('/dashboard/partner/revenue')} className="bg-green-600 hover:bg-green-700">
                            Acessar Dashboard Financeiro
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        )
    }

    if (accountStatus?.status === 'pending') {
        return (
            <div className="max-w-2xl mx-auto mt-8">
                <Card>
                    <CardHeader className="text-center border-b pb-6">
                        <div className="mx-auto w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
                            <Clock className="w-8 h-8 text-yellow-600" />
                        </div>
                        <CardTitle className="text-2xl font-bold">Candidatura em Análise</CardTitle>
                        <CardDescription className="text-base mt-2">
                            Recebemos o seu pedido para ingressar no programa de Parceiros.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <div className="bg-gray-50 p-4 rounded-lg flex items-start space-x-3 text-sm text-gray-700">
                            <ShieldCheck className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                            <p>
                                Nossa equipe de moderação revisará o seu perfil, histórico e motivação. O processo geralmente leva de 1 a 3 dias úteis. Você receberá um aviso assim que a candidatura for atualizada.
                            </p>
                        </div>
                    </CardContent>
                    <CardFooter className="flex justify-center pb-8">
                        <Button variant="outline" onClick={() => router.push('/dashboard')}>
                            Voltar ao Dashboard
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        )
    }

    if (accountStatus?.status === 'rejected') {
        return (
            <div className="max-w-2xl mx-auto mt-8">
                <Card className="border-red-200">
                    <CardHeader>
                        <div className="flex items-center space-x-2 text-red-600 mb-2">
                            <AlertCircle className="w-5 h-5" />
                            <CardTitle>Candidatura Não Aprovada</CardTitle>
                        </div>
                        <CardDescription>
                            Infelizmente seu pedido para ingressar no programa de parceiros não pôde ser aceito neste momento.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {accountStatus.rejectionReason && (
                            <div className="bg-red-50 p-4 rounded-md text-sm text-red-800 border border-red-100 mb-6">
                                <span className="font-semibold block mb-1">Motivo informado pela moderação:</span>
                                {accountStatus.rejectionReason}
                            </div>
                        )}

                        <div className="space-y-4">
                            <h3 className="font-medium">Você pode enviar uma nova solicitação:</h3>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="motivation">Nova carta de motivação</Label>
                                    <Textarea
                                        id="motivation"
                                        disabled={submitting}
                                        value={motivation}
                                        onChange={(e) => setMotivation(e.target.value)}
                                        placeholder="Explique-nos o que mudou e por que você deve ser reconsiderado para o programa de Parceiros."
                                        rows={5}
                                    />
                                </div>
                                <Button type="submit" disabled={submitting} className="w-full">
                                    {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                                    Reenviar Candidatura
                                </Button>
                            </form>
                        </div>
                    </CardContent>
                </Card>
            </div>
        )
    }

    // Formulário Padrão para quem ainda não tem conta
    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-12">

            {/* HEROBANNER DO PROGRAMA */}
            <div className="bg-gradient-to-br from-green-900 via-green-800 to-green-900 rounded-2xl p-8 md:p-12 text-white shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-green-500 opacity-20 blur-3xl rounded-full translate-x-1/2 -translate-y-1/2"></div>
                <div className="relative z-10 max-w-2xl">
                    <h1 className="text-3xl md:text-4xl font-extrabold mb-4 tracking-tight">
                        Transforme seu trabalho em um negócio lucrativo
                    </h1>
                    <p className="text-green-100 text-lg md:text-xl leading-relaxed">
                        O <strong className="text-white">Player.Action Partners</strong> permite que treinadores vendam planos e mensalidades diretamennte na plataforma, cobrando dos alunos de forma profissional, segura e automática.
                    </p>
                </div>
            </div>

            {/* BENEFÍCIOS */}
            <div className="grid md:grid-cols-3 gap-6">
                <Card className="border-none shadow-md bg-white">
                    <CardHeader className="pb-3">
                        <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mb-3">
                            <DollarSign className="w-5 h-5" />
                        </div>
                        <CardTitle className="text-lg">Monetize Direto</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-gray-600">
                        Crie combos, assinaturas mensais ou planos unicos. Seus alunos pagam com Cartão ou Pix e o dinheiro vai direto para a sua conta via Stripe Connect.
                    </CardContent>
                </Card>

                <Card className="border-none shadow-md bg-white">
                    <CardHeader className="pb-3">
                        <div className="w-10 h-10 bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center mb-3">
                            <Users className="w-5 h-5" />
                        </div>
                        <CardTitle className="text-lg">Gestão Financeira</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-gray-600">
                        Veja quem está devendo, quem pagou e acompanhe sua receita mensal recorrente sem precisar sair do painel do treinador.
                    </CardContent>
                </Card>

                <Card className="border-none shadow-md bg-white">
                    <CardHeader className="pb-3">
                        <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center mb-3">
                            <Rocket className="w-5 h-5" />
                        </div>
                        <CardTitle className="text-lg">Acesso Elite</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-gray-600">
                        Parceiros ganham destaque público. Jogadores focados que entrarem na plataforma poderão te encontrar e assinar seus treinos.
                    </CardContent>
                </Card>
            </div>

            {/* FORMULÁRIO DE CANDIDATURA */}
            <Card className="shadow-lg border-green-100">
                <CardHeader className="bg-gray-50/50 border-b">
                    <CardTitle>Envie sua candidatura</CardTitle>
                    <CardDescription>
                        Buscamos treinadores sérios e comprometidos para vender serviços na nossa plataforma.
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-3">
                            <Label htmlFor="motivation" className="text-base font-semibold">
                                Por que você quer se tornar um Parceiro Player.Action?
                            </Label>
                            <p className="text-sm text-gray-500 leading-relaxed">
                                Conte-nos sobre a sua experiência com futebol, quantos alunos você atende hoje ou planeja atender, e como a plataforma ajudará você a escalar o seu negócio de treinos.
                            </p>
                            <Textarea
                                id="motivation"
                                disabled={submitting}
                                value={motivation}
                                onChange={(e) => setMotivation(e.target.value)}
                                placeholder="Sou treinador há 5 anos, focado em alta performance. Hoje treino 15 alunos de forma independente, mas usar o WhatsApp e cobrar PIX mensal tem sido..."
                                className="min-h-[150px] resize-y text-base p-4"
                            />
                            <div className="flex justify-between items-center text-xs">
                                <span className={motivation.length < 20 && motivation.length > 0 ? "text-red-500" : "text-gray-400"}>
                                    Mínimo de 20 caracteres ({motivation.length} digitados)
                                </span>
                            </div>
                        </div>

                        <div className="bg-amber-50 rounded-lg p-4 border border-amber-100 flex items-start space-x-3">
                            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                            <div className="text-sm text-amber-800">
                                <strong>Importante:</strong> Ao ser aprovado como parceiro, você criará uma conta conectada na Stripe e precisará enviar sua própria documentação para receber os pagamentos legalmente.
                            </div>
                        </div>

                        <TermsCheckbox checked={termsAccepted} onChange={setTermsAccepted} variant="partner" className="mt-4" />

                        <Button
                            type="submit"
                            disabled={submitting || motivation.length < 20 || !termsAccepted}
                            className="w-full md:w-auto h-12 px-8 text-base bg-green-600 hover:bg-green-700"
                        >
                            {submitting ? <Loader2 className="w-5 h-5 mr-3 animate-spin" /> : null}
                            Enviar Candidatura B2B
                        </Button>
                    </form>
                </CardContent>
            </Card>

        </div>
    )
}
