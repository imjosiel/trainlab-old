'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { MessageSquare, X, Send, ChevronLeft, Loader2, Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { format, isToday, isYesterday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { usePathname } from 'next/navigation'
import { ROLES } from '@/lib/constants'
import { getPusherClient, convChannel, EVENTS } from '@/lib/pusher-client'

function Avatar({ user, size = 'sm' }) {
    const sz = size === 'xs' ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-xs'
    const initials = (user?.name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    if (user?.image) {
        return <img src={user.image} alt={user.name} className={`${sz} rounded-full object-cover flex-shrink-0`} />
    }
    return (
        <div className={`${sz} rounded-full bg-green-100 text-green-700 font-semibold flex items-center justify-center flex-shrink-0`}>
            {initials}
        </div>
    )
}

export function MiniChat() {
    const { data: session } = useSession()
    const pathname = usePathname()
    const [open, setOpen]               = useState(false)
    const [minimized, setMinimized]     = useState(false)
    const [conversations, setConversations] = useState([])
    const [activeConv, setActiveConv]   = useState(null)
    const [messages, setMessages]       = useState([])
    const [input, setInput]             = useState('')
    const [sending, setSending]         = useState(false)
    const [convLoading, setConvLoading] = useState(false)
    const [msgLoading, setMsgLoading]   = useState(false)
    const [showContactPicker, setShowContactPicker] = useState(false)
    const [contacts, setContacts] = useState([])
    const [activeTab, setActiveTab] = useState('profissional')
    const [startingChat, setStartingChat] = useState(null)
    const bottomRef = useRef(null)
    const currentUserId = session?.user?.id
    const isTrainer = session?.user?.roles?.includes(ROLES.PROFESSIONAL)

    // Buscar contatos ao abrir picker
    const openContactPicker = async () => {
        setShowContactPicker(true)
        if (contacts.length === 0) {
            const endpoint = isTrainer ? '/api/backend/students' : '/api/backend/my-trainers'
            const res = await fetch(endpoint)
            if (res.ok) {
                const data = await res.json()
                setContacts(isTrainer ? data.students : data.trainers)
            }
        }
    }

    const startConversationWithContact = async (contact) => {
        setStartingChat(contact.id)
        try {
            const studentId = isTrainer ? contact.userId : currentUserId
            const payload = { 
                trainerId: isTrainer ? currentUserId : contact.id,
                studentId 
            }

            if (!studentId) throw new Error("Este aluno ainda não criou a sua conta na plataforma.")

            const res = await fetch('/api/backend/conversations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            if (!res.ok) throw new Error((await res.json()).error)
            const { conversation } = await res.json()
            await fetchConversations()
            setShowContactPicker(false)
            setActiveConv(conversation)
            if (!open) setOpen(true)
        } catch (e) {
            toast.error(e.message)
        } finally {
            setStartingChat(null)
        }
    }

    // Carregar conversas quando o mini-chat abre
    const fetchConversations = useCallback(async () => {
        const res = await fetch(`/api/backend/conversations?t=${Date.now()}`, { cache: 'no-store' })
        if (res.ok) {
            const { conversations: convs } = await res.json()
            setConversations(convs)
        }
        setConvLoading(false)
    }, [])

    useEffect(() => {
        if (!session) return
        if (conversations.length === 0) setConvLoading(true)
        fetchConversations()
    }, [session, fetchConversations])

    // Subscrever em TODAS as conversas via Pusher para atualizar o badge globalmente
    // O array de dependências usa IDs das conversas para não recriar os bindings à toa
    const convIds = conversations.map(c => c.id).sort().join(',')
    useEffect(() => {
        if (!convIds) return

        const pusher = getPusherClient()
        const channels = []

        conversations.forEach(conv => {
            const channelName = convChannel(conv.id)
            const channel = pusher.subscribe(channelName)
            
            // Callback global: se chegar mensagem para ALGUMA conversa minha,
            // atualizamos a lista de conversas no background (se o chat estiver fechado ou noutra conversa)
            channel.bind(EVENTS.NEW_MESSAGE, ({ message }) => {
                // Se não for minha própria mensagem, recarregar a lista silenciosamente
                if (message.senderId !== currentUserId) {
                    fetchConversations()
                }
            })
            
            channels.push(channel)
        })

        return () => {
            channels.forEach(ch => {
                ch.unbind(EVENTS.NEW_MESSAGE)
                // Não damos unsubscribe de cara pois a view detalhada também pode estar inscrita.
            })
        }
    }, [convIds, currentUserId, fetchConversations])

    // Ao abrir uma conversa: buscar histórico e subscrever Pusher
    useEffect(() => {
        if (!activeConv) return

        // Carregar histórico inicial
        setMsgLoading(true)
        fetch(`/api/backend/conversations/${activeConv.id}/messages`)
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data?.messages) setMessages(data.messages)
                setMsgLoading(false)
            })

        // Marcar como lida
        fetch(`/api/backend/conversations/${activeConv.id}/read`, { method: 'PATCH' }).catch(() => {})
        setConversations(cs => cs.map(c => c.id === activeConv.id ? { ...c, unreadCount: 0 } : c))

        // ── Pusher: subscrever canal privado ──────────────────────────────────
        const pusher  = getPusherClient()
        const channel = pusher.subscribe(convChannel(activeConv.id))

        const handleNewMessage = ({ message }) => {
            setMessages(prev => {
                if (prev.some(m => m.id === message.id)) return prev
                return [...prev, message]
            })
            // Aqui não re-buscamos fetchConversations se a conversa estiver ativa 
            // pois queremos que o unreadCount não pule para 1 se estamos lendo.
            // O unread será atualizado via background handler.
        }

        channel.bind(EVENTS.NEW_MESSAGE, handleNewMessage)

        return () => {
            channel.unbind(EVENTS.NEW_MESSAGE, handleNewMessage)
            // Não deletamos a subscription aqui pois o listener global precisa dela
        }
    }, [activeConv])

    // Scroll to bottom on new messages
    useEffect(() => {
        if (open && !minimized) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, open, minimized])

    const send = async () => {
        if (!input.trim() || sending || !activeConv) return
        setSending(true)
        const content = input.trim()
        const optimistic = { id: 'tmp-' + Date.now(), content, senderId: currentUserId, createdAt: new Date().toISOString() }
        setMessages(m => [...m, optimistic])
        setInput('')
        try {
            const res = await fetch(`/api/backend/conversations/${activeConv.id}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content }),
            })
            if (!res.ok) throw new Error((await res.json()).error)
            const { message: real } = await res.json()
            setMessages(m => m.map(msg => msg.id === optimistic.id ? real : msg))
            fetchConversations() // Atualiza a ordem e última mensagem das conversas
        } catch (e) {
            toast.error(e.message)
            setMessages(m => m.filter(msg => msg.id !== optimistic.id))
            setInput(content)
        } finally {
            setSending(false)
        }
    }

    const totalUnread = conversations.reduce((s, c) => s + (c.unreadCount ?? 0), 0)
    const other = activeConv
        ? (activeConv.trainerId === currentUserId ? activeConv.student : activeConv.trainer)
        : null

    // Ocultar na página /messages (para não duplicar com a página principal)
    if (pathname?.includes('/messages')) return null

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
            {/* Chat panel */}
            {open && (
                <div className="w-80 bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
                    style={{ height: minimized ? 'auto' : '420px' }}>

                    {/* Header */}
                    <div className="flex items-center gap-2 px-4 py-3 bg-green-600 text-white">
                        {(activeConv || showContactPicker) && (
                            <button 
                                onClick={() => { 
                                    if(activeConv) { setActiveConv(null); setMessages([]) } 
                                    else { setShowContactPicker(false) } 
                                }} 
                                className="hover:opacity-70 transition-opacity mr-1"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                        )}
                        <div className="flex-1 min-w-0">
                            {activeConv
                                ? <p className="text-sm font-semibold truncate">{other?.name}</p>
                                : <p className="text-sm font-semibold">{showContactPicker ? 'Nova Conversa' : 'Mensagens'}</p>
                            }
                        </div>
                        {!activeConv && !showContactPicker && (
                            <button onClick={openContactPicker} className="hover:opacity-70 transition-opacity mr-2" title="Nova Conversa">
                                <Plus className="w-4 h-4" />
                            </button>
                        )}
                        <button onClick={() => setMinimized(m => !m)} className="hover:opacity-70 transition-opacity">
                            <Minus className="w-4 h-4" />
                        </button>
                        <button onClick={() => { setOpen(false); setActiveConv(null); setMessages([]) }} className="hover:opacity-70 transition-opacity">
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {!minimized && (
                        <>
                            {/* Picker de Contatos */}
                            {!activeConv && showContactPicker && (
                                <div className="flex flex-col flex-1 h-[373px] bg-white">
                                    {/* Tabs */}
                                    <div className="flex border-b overflow-x-auto hide-scrollbar flex-shrink-0">
                                        <button 
                                            onClick={() => setActiveTab('profissional')}
                                            className={`flex-1 py-2 px-1 text-xs font-medium border-b-2 whitespace-nowrap ${activeTab === 'profissional' ? 'border-green-600 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                                        >
                                            {isTrainer ? 'Alunos' : 'Treinos'}
                                        </button>
                                        <button 
                                            onClick={() => setActiveTab('amigos')}
                                            className={`flex-1 flex items-center justify-center gap-1 py-2 px-1 text-xs font-medium border-b-2 whitespace-nowrap ${activeTab === 'amigos' ? 'border-gray-300 text-gray-400' : 'border-transparent text-gray-400 opacity-60'}`}
                                        >
                                            Amigos <span className="text-[8px] border border-gray-200 bg-gray-100 px-1 py-0.5 rounded uppercase leading-none">Breve</span>
                                        </button>
                                        <button 
                                            onClick={() => setActiveTab('grupos')}
                                            className={`flex-1 flex items-center justify-center gap-1 py-2 px-1 text-xs font-medium border-b-2 whitespace-nowrap ${activeTab === 'grupos' ? 'border-gray-300 text-gray-400' : 'border-transparent text-gray-400 opacity-60'}`}
                                        >
                                            Grupos <span className="text-[8px] border border-gray-200 bg-gray-100 px-1 py-0.5 rounded uppercase leading-none">Breve</span>
                                        </button>
                                    </div>
                                    
                                    <div className="flex-1 overflow-y-auto p-2">
                                        {activeTab === 'profissional' && (
                                            <>
                                                {contacts.length === 0 && (
                                                    <div className="flex flex-col items-center justify-center h-48 text-center text-gray-500">
                                                        <MessageSquare className="w-8 h-8 text-gray-200 mb-2" />
                                                        <p className="text-xs">Nenhum encontrado</p>
                                                    </div>
                                                )}
                                                {contacts.map(contact => (
                                                    <button
                                                        key={contact.id}
                                                        onClick={() => startConversationWithContact(contact)}
                                                        disabled={startingChat === contact.id || (isTrainer && !contact.userId)}
                                                        className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        <Avatar user={contact} />
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-semibold text-xs text-gray-900 truncate">{contact.name}</p>
                                                            {contact.email && <p className="text-[10px] text-gray-400 truncate">{contact.email}</p>}
                                                            {isTrainer && !contact.userId && <p className="text-[9px] text-orange-500 font-medium">Conta pendente</p>}
                                                        </div>
                                                        {startingChat === contact.id && <Loader2 className="w-3 h-3 animate-spin text-green-600" />}
                                                    </button>
                                                ))}
                                            </>
                                        )}
                                        {activeTab !== 'profissional' && (
                                            <div className="flex flex-col items-center justify-center h-48 text-center opacity-60">
                                                <p className="text-xs font-medium text-gray-500">Funcionalidade Bloqueada</p>
                                                <p className="text-[10px] text-gray-400 mt-1">Disponível em breve.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Lista de conversas */}
                            {!activeConv && !showContactPicker && (
                                <div className="flex-1 overflow-y-auto">
                                    {convLoading && (
                                        <div className="flex justify-center py-8">
                                            <Loader2 className="w-5 h-5 animate-spin text-green-600" />
                                        </div>
                                    )}
                                    {!convLoading && conversations.length === 0 && (
                                        <div className="flex flex-col items-center justify-center h-40 text-center px-4">
                                            <MessageSquare className="w-8 h-8 text-gray-200 mb-2" />
                                            <p className="text-xs text-gray-400">Nenhuma conversa ainda</p>
                                        </div>
                                    )}
                                    {conversations.map(conv => {
                                        const convOther = conv.trainerId === currentUserId ? conv.student : conv.trainer
                                        const lastMsg = conv.messages?.[0]
                                        return (
                                            <button
                                                key={conv.id}
                                                onClick={() => setActiveConv(conv)}
                                                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                                            >
                                                <div className="relative">
                                                    <Avatar user={convOther} />
                                                    {conv.unreadCount > 0 && (
                                                        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-green-600 text-white text-[9px] font-bold flex items-center justify-center">
                                                            {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-sm truncate ${conv.unreadCount > 0 ? 'font-semibold' : 'font-medium'}`}>{convOther?.name}</p>
                                                    {lastMsg && <p className="text-xs text-gray-400 truncate">{lastMsg.content}</p>}
                                                </div>
                                            </button>
                                        )
                                    })}
                                </div>
                            )}

                            {/* Área de mensagens */}
                            {activeConv && (
                                <>
                                    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-gray-50">
                                        {msgLoading && (
                                            <div className="flex justify-center py-4">
                                                <Loader2 className="w-4 h-4 animate-spin text-green-600" />
                                            </div>
                                        )}
                                        {messages.map(msg => {
                                            const isMine = msg.senderId === currentUserId
                                            return (
                                                <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                                                    <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs shadow-sm
                                                        ${isMine ? 'bg-green-600 text-white rounded-br-sm' : 'bg-white text-gray-800 rounded-bl-sm border border-gray-100'}`}>
                                                        <p className="leading-relaxed">{msg.content}</p>
                                                        <p className={`text-[9px] mt-0.5 opacity-60 ${isMine ? 'text-right' : ''}`}>
                                                            {format(new Date(msg.createdAt), 'HH:mm')}
                                                        </p>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                        <div ref={bottomRef} />
                                    </div>

                                    {/* Input */}
                                    <div className="border-t bg-white px-3 py-2">
                                        <form className="flex items-center gap-2" onSubmit={e => { e.preventDefault(); send() }}>
                                            <Input
                                                className="flex-1 h-8 text-xs rounded-full"
                                                placeholder="Mensagem..."
                                                value={input}
                                                onChange={e => setInput(e.target.value)}
                                                autoComplete="off"
                                            />
                                            <Button type="submit" size="icon" className="h-8 w-8 rounded-full bg-green-600 hover:bg-green-700 flex-shrink-0" disabled={!input.trim() || sending}>
                                                {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                                            </Button>
                                        </form>
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* FAB Toggle Button */}
            <button
                onClick={() => setOpen(o => !o)}
                className="w-14 h-14 rounded-full bg-green-600 hover:bg-green-700 text-white shadow-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 relative"
            >
                {open ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
                {!open && totalUnread > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center animate-bounce">
                        {totalUnread > 9 ? '9+' : totalUnread}
                    </span>
                )}
            </button>
        </div>
    )
}
