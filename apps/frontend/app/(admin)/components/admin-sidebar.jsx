import Link from "next/link"
import { LayoutDashboard, Medal, Users, Settings, Handshake, TrendingUp, LinkIcon } from "lucide-react"

export function AdminSidebar() {
    return (
        <div className="flex h-full flex-col">
            <div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6">
                <Link href="/admin" className="flex items-center gap-2 font-semibold text-primary">
                    <Medal className="h-6 w-6" />
                    <span className="">Administração</span>
                </Link>
            </div>
            <div className="flex-1 overflow-auto py-2">
                <nav className="grid items-start px-2 text-sm font-medium lg:px-4">
                    <Link
                        href="/admin"
                        className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary"
                    >
                        <LayoutDashboard className="h-4 w-4" />
                        Visão Geral
                    </Link>
                    <Link
                        href="/admin/sports"
                        className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary"
                    >
                        <Medal className="h-4 w-4" />
                        Esportes
                    </Link>
                    <Link
                        href="/admin/partners"
                        className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary"
                    >
                        <Handshake className="h-4 w-4" />
                        Parceiros B2B
                    </Link>
                    <Link
                        href="/admin/partners/revenue"
                        className="flex items-center gap-3 rounded-lg px-3 py-2 pl-9 text-muted-foreground transition-all hover:text-primary text-xs"
                    >
                        <TrendingUp className="h-3.5 w-3.5" />
                        Receita B2B
                    </Link>
                    <Link
                        href="/admin/users"
                        className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary"
                    >
                        <Users className="h-4 w-4" />
                        Usuários
                    </Link>
                    <Link
                        href="/admin/affiliates"
                        className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary"
                    >
                        <LinkIcon className="h-4 w-4" />
                        Afiliados
                    </Link>
                    <Link
                        href="/admin/settings"
                        className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary"
                    >
                        <Settings className="h-4 w-4" />
                        Configurações
                    </Link>
                </nav>
            </div>
        </div>
    )
}
