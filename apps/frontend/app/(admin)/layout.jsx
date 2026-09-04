import { ADMIN_SYSTEM_ROLES } from '@/lib/constants'
import { redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { AdminSidebar } from "./components/admin-sidebar"
import { AdminHeader } from "./components/admin-header"

export default async function AdminLayout({ children }) {
    const session = await getServerSession(authOptions)

    // Apenas ADMIN ou MODERATOR podem acessar
    const systemRoles = session?.user?.systemRoles || []
    if (!session?.user || !systemRoles.some(r => ADMIN_SYSTEM_ROLES.includes(r))) {
        redirect("/dashboard")
    }

    return (
        <div className="flex min-h-screen flex-col md:flex-row">
            {/* Sidebar para telas médias+ */}
            <div className="hidden border-r bg-muted/20 md:block md:w-64">
                <AdminSidebar />
            </div>

            <div className="flex flex-1 flex-col">
                {/* Header mobile e breadcrumbs */}
                <AdminHeader />

                {/* Conteúdo principal */}
                <main className="flex-1 p-6 md:p-8">
                    {children}
                </main>
            </div>
        </div>
    )
}
