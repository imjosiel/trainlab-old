import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Medal, Users, Database } from "lucide-react"

export const metadata = {
    title: "Administração - Player.Action",
    description: "Painel de administração global do Player.Action",
}

export default function AdminDashboard() {
    return (
        <div className="flex flex-col gap-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Administração Global</h1>
                <p className="text-muted-foreground mt-2">
                    Visão geral do sistema Player.Action. Apenas Administradores e Moderadores têm acesso.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Esportes Ativos
                        </CardTitle>
                        <Medal className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">--</div>
                        <p className="text-xs text-muted-foreground">
                            Total de modalidades suportadas
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Usuários
                        </CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">--</div>
                        <p className="text-xs text-muted-foreground">
                            Atletas e Treinadores
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Planos Gerados
                        </CardTitle>
                        <Database className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">--</div>
                        <p className="text-xs text-muted-foreground">
                            Historico da plataforma
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Aqui virão mais gráficos de faturamento no futuro (Stripe Connect) */}
        </div>
    )
}
