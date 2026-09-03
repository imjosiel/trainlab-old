'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { format, isToday, isYesterday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { Send, MessageSquare, Search, Loader2, ArrowLeft, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ROLES } from '@/lib/constants'
import { getPusherClient, convChannel, EVENTS } from '@/lib/pusher-client'
// ─── Helpers ──────────────────────────────────────────────────────────────────

function dateLabel(date) {
    const d = new Date(date)
    if (isToday(d)) return format(d, 'HH:mm')
    if (isYesterday(d)) return 'Ontem'
    return format(d, 'd MMM', { locale: ptBR })
}

function Avatar({ user, size = 'md' }) {
    const sz = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'
    const initials = (user?.name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    if (user?.image) {
        return <img src={user.image} alt={user.name} className={`${sz} rounded-full object-cover flex-shrink-0`} onError={e => e.target.style.display = 'none'} />
    }
    return (
        <div className={`${sz} rounded-full bg-green-100 text-green-700 font-semibold flex items-center justify-center flex-shrink-0`}>
            {initials}
        </div>
    )
}

// ─── Conversation List ─────────────────────────────────────────────────────────

function ConversationList({ conversations, activeId, onSelect, currentUserId, loading, isTrainer, onNewConversation }) {
    const [search, setSearch] = useState('')
    const filtered = conversations.filter(c => {
        const other = c.trainerId === currentUserId ? c.student : c.trainer
        return other?.name?.toLowerCase().includes(search.toLowerCase())
    })

    if (loading) {
        return (
            <div className="flex items-center justify-center h-48">
                <Loader2 className="w-6 h-6 animate-spin text-green-600" />
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full">
            <div className="p-3 border-b flex items-center gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                        className="pl-9 h-8 text-sm"
                        placeholder="Buscar conversa..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <Button size="icon" variant="outline" className="h-8 w-8 flex-shrink-0" onClick={onNewConversation} title="Nova conversa">
                    <Plus className="w-4 h-4" />
                </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
                {filtered.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-48 text-center px-4">
                        <MessageSquare className="w-8 h-8 text-gray-300 mb-2" />
                        <p className="text-sm text-gray-400">Nenhuma conversa ainda</p>
                        <p className="text-xs text-gray-400 mt-1">
                            Clique em + para iniciar uma nova conversa
                        </p>
                    </div>
                )}
                {filtered.map(conv => {
                    const other = conv.trainerId === currentUserId ? conv.student : conv.trainer
                    const lastMsg = conv.messages?.[0]
                    const isActive = conv.id === activeId
                    return (
                        <button
                            key={conv.id}
                            onClick={() => onSelect(conv)}
                            className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50
                                ${isActive ? 'bg-green-50 border-r-2 border-green-600' : ''}`}
                        >
                            <div className="relative flex-shrink-0">
                                <Avatar user={other} />
                                {conv.unreadCount > 0 && (
                                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-green-600 text-white text-[10px] font-bold flex items-center justify-center">
                                        {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                                    </span>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                    <p className={`text-sm leading-tight truncate ${conv.unreadCount > 0 ? 'font-semibold text-gray-900' : 'font-medium text-gray-800'}`}>
                                        {other?.name ?? '—'}
                                    </p>
                                    {lastMsg && (
                                        <span className="text-[10px] text-gray-400 flex-shrink-0">
                                            {dateLabel(lastMsg.createdAt)}
                                        </span>
                                    )}
                                </div>
                                {lastMsg && (
                                    <p className={`text-xs truncate mt-0.5 ${conv.unreadCount > 0 ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                                        {lastMsg.senderId === currentUserId ? 'Você: ' : ''}{lastMsg.content}
                                    </p>
                                )}
                            </div>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

// ─── Chat Area ────────────────────────────────────────────────────────────────

function ChatArea({ conversation, currentUserId, onBack, onMessageReceived }) {
    const [messages, setMessages] = useState([])
    const [loading, setLoading] = useState(true)
    const [input, setInput] = useState('')
    const [sending, setSending] = useState(false)
    const bottomRef = useRef(null)
    const other = conversation.trainerId === currentUserId ? conversation.student : conversation.trainer

    // Carregar mensagens iniciais
    const fetchMessages = useCallback(async () => {
        const res = await fetch(`/api/backend/conversations/${conversation.id}/messages`)
        if (res.ok) {
            const { messages: msgs } = await res.json()
            setMessages(msgs)
        }
        setLoading(false)
    }, [conversation.id])

    // Marcar como lida
    const markRead = useCallback(async () => {
        await fetch(`/api/backend/conversations/${conversation.id}/read`, { method: 'PATCH' })
    }, [conversation.id])

    useEffect(() => {
        setLoading(true)
        setMessages([])
        fetchMessages()
        markRead()

        // ── Pusher: subscrever canal privado da conversa ──────────────────────
        const pusher  = getPusherClient()
        const channel = pusher.subscribe(convChannel(conversation.id))

        const handleNewMessage = ({ message }) => {
            setMessages(prev => {
                // Ignorar se já existe (ex.: optimistic update do próprio sender)
                if (prev.some(m => m.id === message.id)) return prev
                return [...prev, message]
            })
            // Notificar o layout para atualizar badge
            onMessageReceived?.()
        }

        channel.bind(EVENTS.NEW_MESSAGE, handleNewMessage)

        return () => {
            channel.unbind(EVENTS.NEW_MESSAGE, handleNewMessage)
            // IMPORTANTE: Não chamamos unsubscribe do channel inteiro aqui, pois o
            // listener global do MessagesPage precisa desse canal ativo!
        }
    }, [conversation.id, fetchMessages, markRead, onMessageReceived])

    // Auto scroll to bottom
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const send = async () => {
        if (!input.trim() || sending) return
        setSending(true)
        const optimistic = {
            id: 'tmp-' + Date.now(),
            content: input.trim(),
            senderId: currentUserId,
            sender: { id: currentUserId, name: 'Você' },
            createdAt: new Date().toISOString(),
        }
        setMessages(m => [...m, optimistic])
        setInput('')
        try {
            const res = await fetch(`/api/conversations/${conversation.id}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: optimistic.content }),
            })
            if (!res.ok) throw new Error((await res.json()).error)
            // A mensagem real chega pelo Pusher; removemos o optimistic quando ela chegar
            const { message: real } = await res.json()
            setMessages(m => m.map(msg => msg.id === optimistic.id ? real : msg))

            // Atualiza a sidebar com a mensagem que acabamos de enviar
            if (onMessageReceived) onMessageReceived()
        } catch (e) {
            toast.error(e.message)
            setMessages(m => m.filter(msg => msg.id !== optimistic.id))
            setInput(optimistic.content)
        } finally {
            setSending(false)
        }
    }

    // Group messages by day
    const grouped = messages.reduce((acc, msg) => {
        const day = format(new Date(msg.createdAt), 'yyyy-MM-dd')
        if (!acc[day]) acc[day] = []
        acc[day].push(msg)
        return acc
    }, {})

    function dayLabel(day) {
        const d = new Date(day)
        if (isToday(d)) return 'Hoje'
        if (isYesterday(d)) return 'Ontem'
        return format(d, "d 'de' MMMM", { locale: ptBR })
    }

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b bg-white">
                <Button variant="ghost" size="icon" className="md:hidden h-8 w-8" onClick={onBack}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <Avatar user={other} />
                <div className="flex-1">
                    <p className="font-semibold text-sm text-gray-900">{other?.name}</p>
                    <p className="text-xs text-gray-400">Conversa privada</p>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-gray-50">
                {loading && (
                    <div className="flex justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-green-600" />
                    </div>
                )}
                {!loading && Object.entries(grouped).map(([day, msgs]) => (
                    <div key={day}>
                        {/* Day separator */}
                        <div className="flex items-center gap-3 my-3">
                            <div className="flex-1 h-px bg-gray-200" />
                            <span className="text-xs text-gray-400 font-medium px-2">{dayLabel(day)}</span>
                            <div className="flex-1 h-px bg-gray-200" />
                        </div>
                        <div className="space-y-2">
                            {msgs.map(msg => {
                                const isMine = msg.senderId === currentUserId
                                return (
                                    <div key={msg.id} className={`flex items-end gap-2 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                                        {!isMine && <Avatar user={msg.sender} size="sm" />}
                                        <div className={`max-w-[70%] group`}>
                                            <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm
                                                ${isMine
                                                    ? 'bg-green-600 text-white rounded-br-sm'
                                                    : 'bg-white text-gray-800 rounded-bl-sm border border-gray-100'}`}>
                                                {msg.content}
                                            </div>
                                            <p className={`text-[10px] text-gray-400 mt-1 ${isMine ? 'text-right' : 'text-left'}`}>
                                                {format(new Date(msg.createdAt), 'HH:mm')}
                                                {isMine && msg.readAt && ' · Lida'}
                                            </p>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                ))}
                {!loading && messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-48 text-center">
                        <MessageSquare className="w-10 h-10 text-gray-200 mb-3" />
                        <p className="text-sm text-gray-400">Nenhuma mensagem ainda</p>
                        <p className="text-xs text-gray-400 mt-1">Diga olá! 👋</p>
                    </div>
                )}
                <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="border-t bg-white px-4 py-3">
                <form
                    className="flex items-center gap-2"
                    onSubmit={e => { e.preventDefault(); send() }}
                >
                    <Input
                        className="flex-1 rounded-full text-sm"
                        placeholder="Digite uma mensagem..."
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                        autoComplete="off"
                    />
                    <Button
                        type="submit"
                        size="icon"
                        className="rounded-full bg-green-600 hover:bg-green-700 flex-shrink-0"
                        disabled={!input.trim() || sending}
                    >
                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </Button>
                </form>
            </div>
        </div>
    )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MessagesPage() {
    const { data: session } = useSession()
    const [conversations, setConversations] = useState([])
    const [loading, setLoading] = useState(true)
    const [activeConv, setActiveConv] = useState(null)
    const [mobileView, setMobileView] = useState('list') // 'list' | 'chat'
    const [showContactPicker, setShowContactPicker] = useState(false)
    const [contacts, setContacts] = useState([])
    const [activeTab, setActiveTab] = useState('profissional')
    const [startingChat, setStartingChat] = useState(null)
    const currentUserId = session?.user?.id
    const isTrainer = session?.user?.roles?.includes(ROLES.PROFESSIONAL)

    const fetchConversations = useCallback(async () => {
        const res = await fetch(`/api/backend/conversations?t=${Date.now()}`, { cache: 'no-store' })
        if (res.ok) {
            const { conversations: convs } = await res.json()
            setConversations(convs)
        }
        setLoading(false)
    }, [])

    // Carregar lista de conversas uma única vez ou ao ser notificado
    useEffect(() => {
        fetchConversations()
    }, [fetchConversations])

    // Subscrever em TODAS as conversas do usuário para atualizar a lista lateral em tempo real
    const convIds = conversations.map(c => c.id).sort().join(',')
    useEffect(() => {
        if (!convIds) return

        const pusher = getPusherClient()
        const channels = []

        conversations.forEach(conv => {
            const channelName = convChannel(conv.id)
            const channel = pusher.subscribe(channelName)
            
            // Callback global: qualquer mensagem nova dispara o refetch
            channel.bind(EVENTS.NEW_MESSAGE, ({ message }) => {
                if (message.senderId !== currentUserId) {
                    fetchConversations()
                }
            })
            
            channels.push(channel)
        })

        return () => {
            channels.forEach(ch => {
                ch.unbind(EVENTS.NEW_MESSAGE)
            })
        }
    }, [convIds, currentUserId, fetchConversations])

    // Buscar contatos ao abrir picker
    const openContactPicker = async () => {
        setShowContactPicker(true)
        if (contacts.length === 0) {
            const endpoint = isTrainer ? '/api/backend/students' : '/api/backend/users/my-trainers'
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
            setMobileView('chat')
        } catch (e) {
            toast.error(e.message)
        } finally {
            setStartingChat(null)
        }
    }

    const handleSelect = (conv) => {
        setActiveConv(conv)
        setMobileView('chat')
        setConversations(cs => cs.map(c => c.id === conv.id ? { ...c, unreadCount: 0 } : c))
    }

    // Callback chamado pelo ChatArea quando chega nova mensagem via Pusher
    const handleMessageReceived = useCallback(() => {
        fetchConversations()
    }, [fetchConversations])

    const totalUnread = conversations.reduce((s, c) => s + (c.unreadCount ?? 0), 0)

    return (
        <div className="flex flex-col h-[calc(100vh-8rem)]">
            <div className="mb-4">
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <MessageSquare className="w-6 h-6 text-green-600" />
                    Mensagens
                    {totalUnread > 0 && (
                        <span className="ml-1 px-2 py-0.5 rounded-full bg-green-600 text-white text-xs font-bold">
                            {totalUnread}
                        </span>
                    )}
                </h1>
                <p className="text-sm text-gray-500 mt-0.5">
                    {isTrainer ? 'Chat direto com seus alunos' : 'Chat direto com seu treinador'}
                </p>
            </div>

            {/* Contact picker overlay (Tabs) */}
            {showContactPicker && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden max-h-[85vh]">
                        <div className="flex items-center justify-between px-5 py-4 border-b">
                            <h3 className="font-semibold text-gray-900">Nova Conversa</h3>
                            <button onClick={() => setShowContactPicker(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        {/* Tabs */}
                        <div className="flex border-b overflow-x-auto hide-scrollbar">
                            <button 
                                onClick={() => setActiveTab('profissional')}
                                className={`flex-1 py-3 px-2 text-sm font-medium border-b-2 whitespace-nowrap ${activeTab === 'profissional' ? 'border-green-600 text-green-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                            >
                                {isTrainer ? 'Meus Alunos' : 'Treinadores'}
                            </button>
                            <button 
                                onClick={() => setActiveTab('amigos')}
                                className={`flex-1 flex items-center justify-center gap-1 py-3 px-2 text-sm font-medium border-b-2 whitespace-nowrap ${activeTab === 'amigos' ? 'border-gray-300 text-gray-400' : 'border-transparent text-gray-400 opacity-60'}`}
                            >
                                Amigos <span className="text-[9px] bg-gray-100 border border-gray-200 px-1 py-0.5 rounded uppercase leading-none">Breve</span>
                            </button>
                            <button 
                                onClick={() => setActiveTab('grupos')}
                                className={`flex-1 flex items-center justify-center gap-1 py-3 px-2 text-sm font-medium border-b-2 whitespace-nowrap ${activeTab === 'grupos' ? 'border-gray-300 text-gray-400' : 'border-transparent text-gray-400 opacity-60'}`}
                            >
                                Grupos <span className="text-[9px] bg-gray-100 border border-gray-200 px-1 py-0.5 rounded uppercase leading-none">Breve</span>
                            </button>
                        </div>

                        <div className="p-4 space-y-2 overflow-y-auto min-h-[250px]">
                            {activeTab === 'profissional' && (
                                <>
                                    {contacts.length === 0 && (
                                        <div className="flex flex-col items-center justify-center h-40 text-center">
                                            <MessageSquare className="w-10 h-10 text-gray-200 mb-3" />
                                            <p className="text-sm text-gray-500">Nenhum contatado encontrado</p>
                                        </div>
                                    )}
                                    {contacts.map(contact => (
                                        <button
                                            key={contact.id}
                                            onClick={() => startConversationWithContact(contact)}
                                            disabled={startingChat === contact.id || (isTrainer && !contact.userId)}
                                            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <Avatar user={contact} />
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-sm text-gray-900 truncate">{contact.name}</p>
                                                {contact.email && <p className="text-xs text-gray-400 truncate">{contact.email}</p>}
                                                {isTrainer && !contact.userId && <p className="text-[10px] text-orange-500 font-medium">Conta pendente</p>}
                                            </div>
                                            {startingChat === contact.id && <Loader2 className="w-4 h-4 animate-spin text-green-600" />}
                                        </button>
                                    ))}
                                </>
                            )}
                            
                            {activeTab !== 'profissional' && (
                                <div className="flex flex-col items-center justify-center h-40 text-center opacity-60">
                                    <p className="text-sm font-medium text-gray-500">Funcionalidade Bloqueada</p>
                                    <p className="text-xs text-gray-400 mt-1 px-4">Estaremos lançando este recurso em uma atualização futura.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="flex-1 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden flex">
                {/* Lista de conversas */}
                <div className={`w-full md:w-72 lg:w-80 border-r flex-shrink-0 flex flex-col
                    ${mobileView === 'chat' ? 'hidden md:flex' : 'flex'}`}>
                    <div className="px-4 py-3 border-b">
                        <h2 className="text-sm font-semibold text-gray-700">Conversas</h2>
                    </div>
                    <div className="flex-1 overflow-hidden">
                        <ConversationList
                            conversations={conversations}
                            activeId={activeConv?.id}
                            onSelect={handleSelect}
                            currentUserId={currentUserId}
                            loading={loading}
                            isTrainer={isTrainer}
                            onNewConversation={openContactPicker}
                        />
                    </div>
                </div>

                {/* Área de chat */}
                <div className={`flex-1 flex flex-col min-w-0
                    ${mobileView === 'list' ? 'hidden md:flex' : 'flex'}`}>
                    {activeConv ? (
                        <ChatArea
                            key={activeConv.id}
                            conversation={activeConv}
                            currentUserId={currentUserId}
                            onBack={() => setMobileView('list')}
                            onMessageReceived={handleMessageReceived}
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center px-8">
                            <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center mb-4">
                                <MessageSquare className="w-10 h-10 text-green-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-gray-700">Selecione uma conversa</h3>
                            <p className="text-sm text-gray-400 mt-2 max-w-xs">
                                Escolha um aluno na lista para ver ou iniciar uma conversa
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
