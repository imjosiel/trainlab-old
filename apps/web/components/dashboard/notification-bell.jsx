'use client'

import { useState, useEffect } from 'react'
import { Bell, Loader2, CheckCircle2, CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { getPusherClient, userChannel, EVENTS } from '@/lib/pusher-client'

function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1)  return 'agora'
    if (mins < 60) return `há ${mins} min`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24)  return `há ${hrs}h`
    const days = Math.floor(hrs / 24)
    return `há ${days}d`
}

export function NotificationBell() {
    const [notifications, setNotifications] = useState([])
    const [unreadCount, setUnreadCount] = useState(0)
    const [acceptingMap, setAcceptingMap] = useState({})
    const [open, setOpen] = useState(false)
    const { data: session } = useSession()
    const router = useRouter()

    const fetchNotifications = async () => {
        try {
            const res = await fetch('/api/backend/notifications')
            if (res.ok) {
                const data = await res.json()
                setNotifications(data.notifications || [])
                setUnreadCount(data.unreadCount || 0)
            }
        } catch (error) {
            console.error('Error fetching notifications:', error)
        }
    }

    useEffect(() => {
        fetchNotifications()
        
        if (!session?.user?.id) return

        const pusher = getPusherClient()
        const channel = pusher.subscribe(userChannel(session.user.id))

        const handleNewNotification = (data) => {
            // Se o Prisma já mandou o objeto inteiro (create single), evitamos gastar a API!
            if (data?.notif) {
                setNotifications(prev => {
                    if (prev.some(n => n.id === data.notif.id)) return prev
                    return [data.notif, ...prev]
                })
                setUnreadCount(prev => prev + 1)
            } else {
                // Caso seja createMany (onde não temos o objeto enviado), aí sim fetch
                fetchNotifications()
            }
        }

        channel.bind(EVENTS.NEW_NOTIFICATION, handleNewNotification)

        return () => {
            channel.unbind(EVENTS.NEW_NOTIFICATION, handleNewNotification)
        }
    }, [session?.user?.id])

    const markAsRead = async (id) => {
        try {
            await fetch(`/api/backend/notifications/${id}/read`, { method: 'PATCH' })
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n))
            setUnreadCount(prev => Math.max(0, prev - 1))
        } catch (error) {
            console.error('Failed to mark as read:', error)
        }
    }

    const markAllAsRead = async () => {
        const unread = notifications.filter(n => !n.isRead)
        if (unread.length === 0) return
        await Promise.all(unread.map(n =>
            fetch(`/api/backend/notifications/${n.id}/read`, { method: 'PATCH' }).catch(() => {})
        ))
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
        setUnreadCount(0)
    }

    const handleClick = async (n) => {
        if (!n.isRead) await markAsRead(n.id)
        if (n.link) {
            setOpen(false)
            router.push(n.link)
        }
    }

    const handleAcceptInvite = async (e, notification) => {
        e.stopPropagation()
        const { token } = notification.metadata
        if (!token) return

        setAcceptingMap(prev => ({ ...prev, [notification.id]: true }))
        try {
            const res = await fetch('/api/backend/students/invite/accept', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || 'Erro ao aceitar convite')
            }

            toast.success(data.message)
            await markAsRead(notification.id)
            router.refresh()
        } catch (error) {
            toast.error(error.message)
        } finally {
            setAcceptingMap(prev => ({ ...prev, [notification.id]: false }))
        }
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative group hover:bg-gray-100 dark:hover:bg-gray-800">
                    <Bell className="h-5 w-5 text-gray-600 group-hover:text-gray-900 dark:text-gray-300 dark:group-hover:text-white transition-colors" />
                    {unreadCount > 0 && (
                        <span className="absolute top-1 right-1 flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0 mr-4 mt-2" align="end">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <h4 className="font-semibold text-sm">Notificações</h4>
                    <div className="flex items-center gap-2">
                        {unreadCount > 0 && (
                            <>
                                <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">
                                    {unreadCount} novas
                                </span>
                                <button
                                    onClick={markAllAsRead}
                                    className="text-xs text-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1"
                                    title="Marcar todas como lidas"
                                >
                                    <CheckCheck className="w-3.5 h-3.5" />
                                </button>
                            </>
                        )}
                    </div>
                </div>

                <div className="max-h-[320px] overflow-y-auto">
                    {notifications.length === 0 ? (
                        <div className="p-6 text-center text-sm text-gray-400 flex flex-col items-center gap-2">
                            <Bell className="w-8 h-8 opacity-20" />
                            Nenhuma notificação no momento.
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {notifications.map((n) => (
                                <div
                                    key={n.id}
                                    className={`p-4 transition-colors ${n.link ? 'cursor-pointer hover:bg-gray-50' : ''} ${!n.isRead ? 'bg-green-50/40' : ''}`}
                                    onClick={() => handleClick(n)}
                                >
                                    <div className="flex gap-3">
                                        <div className="flex-1 space-y-1 min-w-0">
                                            <div className="flex items-start justify-between gap-1">
                                                <p className={`text-sm leading-snug ${!n.isRead ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                                                    {n.title}
                                                </p>
                                                <span className="text-[10px] text-gray-400 whitespace-nowrap flex-shrink-0 mt-0.5">
                                                    {timeAgo(n.createdAt)}
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-500 leading-snug">{n.message}</p>

                                            {/* Action: Aceitar convite — só mostra se tem token e não foi aceito */}
                                            {n.type === 'STUDENT_INVITE' && n.metadata?.token && (
                                                <div className="mt-2 flex gap-2">
                                                    <Button
                                                        size="sm"
                                                        className="bg-green-600 hover:bg-green-700 h-7 text-xs"
                                                        disabled={acceptingMap[n.id]}
                                                        onClick={(e) => handleAcceptInvite(e, n)}
                                                    >
                                                        {acceptingMap[n.id] ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                                                        Aceitar Convite
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                        {!n.isRead && (
                                            <div className="w-2 h-2 bg-green-500 rounded-full mt-1.5 flex-shrink-0" />
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}

