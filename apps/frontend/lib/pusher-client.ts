'use client'

import PusherClient from 'pusher-js'

// Singleton — evita múltiplas conexões WebSocket por página
let clientInstance: PusherClient | null = null

export function getPusherClient(): PusherClient {
    if (clientInstance) return clientInstance
    PusherClient.logToConsole = true // Habilita DEBUG no navegador do usuário
    clientInstance = new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
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
