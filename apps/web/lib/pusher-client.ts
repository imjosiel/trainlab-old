'use client'

import PusherClient from 'pusher-js'

// Singleton — evita múltiplas conexões WebSocket por página
let clientInstance: PusherClient | null = null
let avisouChaveAusente = false

/**
 * Cliente Pusher, ou `null` se a chave não estiver configurada.
 *
 * Antes isto era `new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY!, …)`. Sem
 * a variável, o `!` calava o compilador e o Pusher lançava
 * "You must pass your app key when you instantiate Pusher" **dentro de um client
 * component** — exceção não tratada que derrubava o DASHBOARD INTEIRO. Não era
 * degradação, era tela morta: sino, chat e mensagens dependem disto.
 *
 * Medido numa env sem a chave: `/dashboard` respondia 200 no servidor e o
 * navegador não renderizava nada. O `.env` deste repo tem `PUSHER_CLUSTER` e
 * `NEXT_PUBLIC_PUSHER_CLUSTER`, mas não a chave — então o defeito é alcançável
 * em qualquer deploy com a config pela metade.
 *
 * Tempo real é melhoria, não requisito: as notificações e conversas continuam
 * carregando por HTTP. Então a ausência da chave passa a desligar só o push.
 *
 * Mesma família do A23 (`process.env.MONGO_URL!` no catch-all): asserção de
 * não-nulo em variável de ambiente troca erro de config por explosão em runtime.
 */
export function getPusherClient(): PusherClient | null {
    if (clientInstance) return clientInstance

    const key = process.env.NEXT_PUBLIC_PUSHER_KEY
    if (!key) {
        if (!avisouChaveAusente) {
            avisouChaveAusente = true
            console.warn(
                '[pusher] NEXT_PUBLIC_PUSHER_KEY ausente — atualizações em tempo real ' +
                'desligadas. Notificações e mensagens seguem carregando por HTTP.',
            )
        }
        return null
    }

    PusherClient.logToConsole = true // Habilita DEBUG no navegador do usuário
    clientInstance = new PusherClient(key, {
        cluster:      process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
        authEndpoint: '/api/backend/pusher/auth',
    })
    return clientInstance
}

// Helpers de canal e eventos duplicados aqui para evitar import de lib/pusher no client bundle
export const convChannel = (conversationId: string) =>
    `private-conversation-${conversationId}`

export const userChannel = (userId: string) =>
    `private-user-${userId}`

export const EVENTS = {
    NEW_MESSAGE: 'new-message',
    CONV_UPDATE: 'conversation-updated',
    NEW_NOTIFICATION: 'new-notification',
} as const

