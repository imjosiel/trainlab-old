import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { User, Shield, Trophy, Activity, MapPin, Link as LinkIcon } from 'lucide-react'
import Link from 'next/link'

export const metadata = {
    title: 'Perfil Público - Player.Action',
    description: 'Perfil público gamificado da plataforma Player.Action',
}

async function getPublicUser(username) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/backend/users/public/${encodeURIComponent(username)}`, { cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    return data.user ?? null
}

export default async function PublicProfilePage({ params }) {
    const { username } = await params
    const user = await getPublicUser(username)

    if (!user) notFound()

    const { athleteProfiles } = user

    const ROLE_LABELS = {
        ATHLETE: 'Atleta',
        TRAINER: 'Treinador',
        BOTH: 'Atleta Universal',
        PENDING: 'Iniciante'
    }

    return (
        <div className="min-h-screen bg-gray-50 flex items-start justify-center pt-16 px-4">
            <div className="max-w-xl w-full">

                {/* Logo or Brand Top */}
                <div className="flex justify-center mb-8">
                    <Link href="/">
                        <div className="flex items-center space-x-2">
                            <div className="bg-green-600 text-white p-2 rounded-lg">
                                <Activity className="h-6 w-6" />
                            </div>
                            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-green-600 to-green-800">
                                Player.Action
                            </span>
                        </div>
                    </Link>
                </div>

                <Card className="overflow-hidden border-t-4 border-t-green-600 shadow-xl">
                    <div className="h-32 bg-gradient-to-r from-gray-100 to-gray-200 w-full"></div>

                    <div className="px-6 sm:px-8 pb-8 -mt-16 flex flex-col items-center">
                        <img
                            src={user.image || '/default-avatar.png'}
                            alt={user.name || 'User Avatar'}
                            className="w-32 h-32 rounded-full border-4 border-white shadow-lg bg-white object-cover"
                        />

                        <div className="mt-4 text-center">
                            <h1 className="text-3xl font-bold text-gray-900">{user.name}</h1>
                            <p className="text-green-600 font-medium text-lg mt-1">@{user.username}</p>

                            <div className="flex flex-wrap justify-center gap-2 mt-4">
                                    {user.roles && user.roles.length > 0 ? user.roles.map(r => (
                                        <Badge key={r} variant="secondary" className="px-3 py-1 bg-gray-100 text-gray-800">
                                            <Shield className="w-4 h-4 mr-2 text-gray-500" />
                                            {ROLE_LABELS[r] || r}
                                        </Badge>
                                    )) : (
                                        <Badge variant="secondary" className="px-3 py-1 bg-gray-100 text-gray-800">
                                            <Shield className="w-4 h-4 mr-2 text-gray-500" />
                                            Membro
                                        </Badge>
                                    )}
                            </div>
                        </div>

                        {user.bio && (
                            <div className="mt-8 pt-6 border-t border-gray-100 w-full">
                                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 text-center sm:text-left">Biografia</h3>
                                <p className="text-gray-700 leading-relaxed text-center sm:text-left">
                                    {user.bio}
                                </p>
                            </div>
                        )}

                        {/* Modalities Section */}
                        {athleteProfiles && athleteProfiles.length > 0 && (
                            <div className="mt-8 pt-6 border-t border-gray-100 w-full space-y-6">
                                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 text-center sm:text-left">Modalidades Ativas</h3>

                                <div className="space-y-4">
                                    {athleteProfiles.map((profile) => (
                                        <div key={profile.id} className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm hover:border-green-200 transition-colors">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    <Trophy className="w-5 h-5 text-green-600" />
                                                    <span className="font-bold text-gray-900">{profile.sport?.name}</span>
                                                </div>
                                                <Badge variant="secondary" className="bg-green-50 text-green-700 border-none">
                                                    {profile.technicalLevel || 'Praticante'}
                                                </Badge>
                                            </div>

                                            <div className="flex flex-wrap gap-2 mb-4">
                                                {profile.position && (
                                                    <Badge variant="outline" className="px-3 py-1 bg-white border-gray-200 text-gray-600 capitalize">
                                                        {profile.position}
                                                    </Badge>
                                                )}
                                                {profile.yearsPlaying && (
                                                    <Badge variant="outline" className="px-3 py-1 bg-white border-gray-200 text-gray-600">
                                                        {profile.yearsPlaying} anos
                                                    </Badge>
                                                )}
                                            </div>

                                            {profile.teams && profile.teams.length > 0 && (
                                                <div className="flex items-center text-sm text-gray-500 bg-gray-50 p-2 rounded-lg">
                                                    <MapPin className="w-4 h-4 mr-2 text-gray-400" />
                                                    <span className="font-semibold mr-2">Times:</span>
                                                    <span>{profile.teams.map(t => t.name).join(', ')}</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="mt-8 pt-8 border-t border-gray-100 w-full text-center">
                            <p className="text-sm text-gray-400">
                                Membro desde {new Date(user.createdAt).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                            </p>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    )
}
