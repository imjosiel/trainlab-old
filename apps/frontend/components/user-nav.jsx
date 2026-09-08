'use client'

import { useSession, signOut } from 'next-auth/react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LogOut, User } from 'lucide-react'

export function UserNav() {
    const { data: session } = useSession()
    const user = session?.user

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button className="flex items-center rounded-full outline-none ring-2 ring-transparent hover:ring-primary/30 transition">
                    <Avatar className="h-8 w-8">
                        <AvatarImage src={user?.image ?? ''} alt={user?.name ?? 'Usuário'} />
                        <AvatarFallback>{user?.name?.[0]?.toUpperCase() ?? 'U'}</AvatarFallback>
                    </Avatar>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                    <p className="text-sm font-medium leading-none">{user?.name}</p>
                    <p className="text-xs leading-none text-muted-foreground mt-1">{user?.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                    <a href="/dashboard/profile" className="flex items-center gap-2 cursor-pointer">
                        <User className="h-4 w-4" />
                        Meu Perfil
                    </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onClick={() => signOut({ callbackUrl: '/' })}
                    className="flex items-center gap-2 text-red-500 focus:text-red-500 cursor-pointer"
                >
                    <LogOut className="h-4 w-4" />
                    Sair
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
