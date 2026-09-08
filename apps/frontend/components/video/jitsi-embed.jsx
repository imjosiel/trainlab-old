'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * components/video/jitsi-embed.jsx
 *
 * Embed Jitsi para chamada 1:1 (professor ↔ aluno).
 *
 * - Carrega `external_api.js` do domínio da sala uma única vez (cache por domínio).
 * - Força P2P quando possível (`p2p.enabled: true`): mídia vai direto entre os
 *   pares; o JVB no docker assume só se o ICE direto falhar ou com 3+ pessoas.
 * - Desabilita convites/gravação/streaming (1:1 não precisa).
 * - `enableUserRolesBasedOnToken: true`: o `moderator` do JWT (fatia 38) vira
 *   affiliation no Prosody — dono/admin modera mesmo entrando depois.
 * - Eventos expostos via callbacks para a página hospedeira decidir (voltar,
 *   toast, métrica). Sem regra de negócio aqui.
 */

const scriptPromises = {}

function carregarScriptJitsi(domain) {
  if (typeof window !== 'undefined' && window.JitsiMeetExternalAPI) {
    return Promise.resolve()
  }
  if (!scriptPromises[domain]) {
    scriptPromises[domain] = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = `https://${domain}/external_api.js`
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Falha ao carregar o Jitsi'))
      document.head.appendChild(script)
    })
  }
  return scriptPromises[domain]
}

export function JitsiEmbed({
  domain,
  roomName,
  jwt,
  displayName,
  email,
  height = 640,
  onJoined,
  onLeft,
  onError,
}) {
  const containerRef = useRef(null)
  const apiRef = useRef(null)
  const [carregando, setCarregando] = useState(true)
  const [falha, setFalha] = useState(null)

  useEffect(() => {
    if (!domain || !roomName || !containerRef.current) return
    let cancelado = false

    const montar = async () => {
      try {
        await carregarScriptJitsi(domain)
        if (cancelado || !containerRef.current || !window.JitsiMeetExternalAPI) return
        apiRef.current?.dispose?.()
        const api = new window.JitsiMeetExternalAPI(domain, {
          roomName,
          parentNode: containerRef.current,
          width: '100%',
          height,
          ...(jwt ? { jwt } : {}),
          userInfo: {
            displayName: displayName ?? 'Participante',
            ...(email ? { email } : {}),
          },
          configOverwrite: {
            prejoinPageEnabled: true,
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            enableWelcomePage: false,
            disableInviteFunctions: true,
            enableUserRolesBasedOnToken: true,
            liveStreamingEnabled: false,
            transcribingEnabled: false,
            recordingServiceEnabled: false,
            p2p: { enabled: true },
          },
          interfaceConfigOverwrite: {
            DISABLE_INVITE_FUNCTIONS: true,
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
          },
        })
        apiRef.current = api
        api.addEventListener('videoConferenceJoined', (e) => onJoined?.(e))
        api.addEventListener('videoConferenceLeft', (e) => onLeft?.(e))
        api.addEventListener('readyToClose', (e) => onLeft?.(e))
        api.addEventListener('errorOccurred', (e) => onError?.(e))
        if (!cancelado) setCarregando(false)
      } catch (e) {
        if (!cancelado) {
          setFalha(e.message ?? 'Falha ao carregar o Jitsi')
          setCarregando(false)
          onError?.(e)
        }
      }
    }

    montar()
    return () => {
      cancelado = true
      apiRef.current?.dispose?.()
      apiRef.current = null
    }
  }, [domain, roomName, jwt, displayName, email, height, onJoined, onLeft, onError])

  if (falha) {
    return (
      <div className="w-full rounded-xl overflow-hidden border bg-black min-h-[200px] flex items-center justify-center">
        <p className="text-sm text-red-400 px-6 py-10 text-center">{falha}</p>
      </div>
    )
  }

  return (
    <div className="relative w-full rounded-xl overflow-hidden border bg-black">
      {carregando && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-gray-400 animate-pulse">Carregando chamada…</p>
        </div>
      )}
      <div ref={containerRef} className="w-full min-h-[640px]" />
    </div>
  )
}
