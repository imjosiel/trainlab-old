'use client'

/**
 * components/ui/exercise-video-preview.jsx
 *
 * Fonte única de verdade para exibir thumb + teaser de qualquer exercício.
 * Usada na Biblioteca (/dashboard/exercises) e nas Sessões (/dashboard/plans/[id]).
 *
 * Props:
 *   exercise               { videoUrl, originalVideoKey, hlsProcessed, videoPublicId? }
 *   enableVideoHoverPreview boolean
 *   videoHoverType         'TEASER' | 'FULL' | 'THUMBNAIL'
 *   isHovered              boolean  (controlado pelo componente pai)
 *   isOwner?               boolean  (exibe badge de processamento só para o dono)
 *   processingProgress?    number   (0-100)
 */

import { useState, useEffect, useRef } from 'react'
import { Video } from 'lucide-react'

const R2_CDN = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || ''

// ── Helpers de URL (exportados para uso em testes / outros módulos) ────────────

export function getThumbUrl(exercise) {
  const { videoUrl, originalVideoKey, hlsProcessed, videoPublicId } = exercise || {}
  if (!videoUrl) return null

  // Cloudinary: troca .mp4 por .jpg
  if (videoUrl.includes('cloudinary.com')) return videoUrl.replace(/\.mp4$/i, '.jpg')

  // R2: thumb.jpg só existe após processamento HLS
  if (originalVideoKey && hlsProcessed) {
    const base = originalVideoKey.replace(/\/[^/]+$/, '')
    return R2_CDN ? `${R2_CDN}/${base}/thumb.jpg` : `/api/videos/${base}/thumb.jpg`
  }

  // Legacy: videoPublicId aponta para master.m3u8
  if (videoPublicId?.includes('master.m3u8')) {
    return `/api/videos/${videoPublicId.replace('master.m3u8', 'thumb.jpg')}`
  }

  return null
}

export function getTeaserUrl(exercise, videoHoverType = 'TEASER') {
  const { videoUrl, originalVideoKey, hlsProcessed } = exercise || {}
  if (!videoUrl) return null

  // Cloudinary: injeta transformação no upload path
  if (videoUrl.includes('cloudinary.com')) {
    const t = videoHoverType === 'TEASER' ? 'so_0,du_10,q_auto,w_400,f_auto' : 'q_auto:eco,w_400,f_auto'
    return videoUrl.replace('/upload/', `/upload/${t}/`)
  }

  // R2 processado: teaser.mp4 gerado pelo pipeline
  if (originalVideoKey && hlsProcessed) {
    const base = originalVideoKey.replace(/\/[^/]+$/, '')
    return `/api/videos/${base}/teaser.mp4`
  }

  // R2 ainda não processado: usa o arquivo original como fallback
  if (originalVideoKey) return `/api/videos/${originalVideoKey}`

  return videoUrl
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function ExerciseVideoPreview({
  exercise,
  enableVideoHoverPreview,
  videoHoverType = 'TEASER',
  isHovered,
  isOwner = false,
  processingProgress = 0,
}) {
  const videoRef = useRef(null)
  const [teaserReady, setTeaserReady] = useState(false)

  const thumbUrl  = getThumbUrl(exercise)
  const teaserUrl = getTeaserUrl(exercise, videoHoverType)

  // Pre-fetch: inicia carregamento ao montar o componente
  useEffect(() => {
    if (!teaserUrl || !enableVideoHoverPreview) return
    const vid = videoRef.current
    if (!vid) return
    const onCanPlay = () => setTeaserReady(true)
    vid.addEventListener('canplay', onCanPlay, { once: true })
    if (!vid.src) vid.src = teaserUrl
    return () => vid.removeEventListener('canplay', onCanPlay)
  }, [teaserUrl, enableVideoHoverPreview])

  // Play/pause conforme hover
  useEffect(() => {
    const vid = videoRef.current
    if (!vid || !enableVideoHoverPreview) return
    if (isHovered) {
      vid.currentTime = 0
      vid.play().catch(() => {})
    } else {
      vid.pause()
    }
  }, [isHovered, enableVideoHoverPreview])

  if (!exercise?.videoUrl) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-gray-50">
        <Video className="w-8 h-8 mb-2 opacity-20" />
        <span className="text-[10px] font-medium opacity-50 uppercase tracking-wider">Sem vídeo</span>
      </div>
    )
  }

  return (
    <>
      {/* Thumbnail — esmaece quando o teaser está pronto */}
      {thumbUrl ? (
        <img
          src={thumbUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover transition-all duration-300 group-hover:scale-105"
          style={{ opacity: isHovered && teaserReady ? 0 : 1 }}
          onError={(e) => { e.target.style.display = 'none' }}
        />
      ) : (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 bg-gray-50"
          style={{ opacity: isHovered && teaserReady ? 0 : 1 }}
        >
          <Video className="w-8 h-8 mb-2 opacity-20" />
          <span className="text-[10px] font-medium opacity-50 uppercase tracking-wider">Sem vídeo</span>
        </div>
      )}

      {/* Teaser — sempre no DOM para pre-fetch em background */}
      {teaserUrl && enableVideoHoverPreview && (
        <video
          ref={videoRef}
          muted
          loop
          playsInline
          preload="auto"
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
          style={{ opacity: isHovered && teaserReady ? 1 : 0 }}
          onError={(e) => { e.target.style.display = 'none' }}
        />
      )}

      {/* Badge: vídeo sendo processado (só para o dono) */}
      {isOwner && exercise.originalVideoKey && !exercise.hlsProcessed && (
        <div className="absolute bottom-2 left-2 z-10">
          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-black/60 text-white/80 backdrop-blur-sm">
            <svg className="w-2.5 h-2.5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" />
            </svg>
            {processingProgress > 0 ? `Processando ${processingProgress}%` : 'Aguardando...'}
          </span>
        </div>
      )}

      {/* Hint de Play ao hover */}
      {!isHovered && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="bg-white/90 p-2 rounded-full shadow-lg">
            <Video className="w-5 h-5 text-green-600" />
          </div>
        </div>
      )}
    </>
  )
}
