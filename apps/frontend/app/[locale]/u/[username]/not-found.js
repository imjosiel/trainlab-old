import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { UserX } from 'lucide-react'

export default function NotFound() {
    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <Card className="max-w-md w-full shadow-lg">
                <CardContent className="pt-6 flex flex-col items-center text-center">
                    <UserX className="w-16 h-16 text-gray-400 mb-4" />
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Perfil Não Encontrado</h2>
                    <p className="text-gray-600 mb-6">
                        O usuário que você está procurando não existe na plataforma ou prefere manter seu perfil como privado.
                    </p>
                    <Link href="/" className="text-green-600 font-medium hover:underline">
                        Voltar para a página inicial
                    </Link>
                </CardContent>
            </Card>
        </div>
    )
}
