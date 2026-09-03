'use client'

import { useRef, useState, useEffect, useCallback } from 'react'

// ─── Utility ─────────────────────────────────────────────────────────────────
function formatTime(secs) {
    if (!secs || isNaN(secs)) return '0:00'
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
}

// ─── URL Detection ────────────────────────────────────────────────────────────
function getYouTubeId(url) {
    if (!url) return null
    const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
    return m ? m[1] : null
}

function isDirectVideo(url) {
    if (!url) return false
    return (
        /\.(mp4|webm|ogg|mov|m3u8)(\?.*)?$/i.test(url) ||  // inclui HLS .m3u8
        url.includes('cloudinary.com') ||
        url.startsWith('/api/videos/') ||       // R2 proxy autenticado
        url.includes('hidrasistemas.com.br')    // CDN R2 público
    )
}

// ─── YouTube Embed Player ────────────────────────────────────────────────────
function YouTubePlayer({ videoId, title }) {
    return (
        <div className="relative w-full aspect-video bg-black rounded-3xl overflow-hidden shadow-2xl">
            <iframe
                src={`https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&color=white`}
                title={title || 'Vídeo do exercício'}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
                className="absolute inset-0 w-full h-full border-0"
                loading="lazy"
            />
            {title && (
                <div className="absolute top-0 left-0 right-0 px-5 pt-4 pointer-events-none z-10">
                    <div
                        className="inline-flex items-center gap-1.5 text-white text-xs font-semibold px-3 py-1 rounded-full"
                        style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
                    >
                        <svg viewBox="0 0 24 24" fill="#FF0000" className="w-3.5 h-3.5">
                            <path d="M21.8 8s-.2-1.4-.8-2c-.8-.8-1.7-.8-2.1-.9C16.2 5 12 5 12 5s-4.2 0-6.9.1c-.4.1-1.3.1-2.1.9-.6.6-.8 2-.8 2S2 9.6 2 11.2v1.5c0 1.6.2 3.2.2 3.2s.2 1.4.8 2c.8.8 1.8.7 2.3.8C6.8 19 12 19 12 19s4.2 0 6.9-.2c.4-.1 1.3-.1 2.1-.9.6-.6.8-2 .8-2s.2-1.6.2-3.2v-1.5C22 9.6 21.8 8 21.8 8zM9.7 14.5V9.5l5.7 2.5-5.7 2.5z"/>
                        </svg>
                        YouTube
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── Unknown URL fallback (Google Drive, Vimeo, etc.) ────────────────────────
function ExternalPlayer({ src, title }) {
    return (
        <div className="relative w-full aspect-video bg-gray-900 rounded-3xl overflow-hidden shadow-2xl flex flex-col items-center justify-center gap-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" className="w-14 h-14">
                <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <p className="text-white/40 text-sm font-medium">Vídeo externo</p>
            <a
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-green-400 hover:text-green-300 underline underline-offset-2"
            >
                Abrir link original
            </a>
        </div>
    )
}

// ─── Icons (inline SVG — zero dep) ───────────────────────────────────────────
const IconPlay = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
        <path d="M8 5v14l11-7z" />
    </svg>
)
const IconPause = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
)
const IconVolume = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
)
const IconMute = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
    </svg>
)
const IconFullscreen = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
        <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
    </svg>
)
const IconExitFullscreen = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
        <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
    </svg>
)
const IconReplay10 = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
        {/* Circular arrow arc pointing left/counter-clockwise */}
        <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
        <text x="12" y="15.5" textAnchor="middle" fontSize="5.5" fontWeight="bold" fontFamily="system-ui, sans-serif" fill="currentColor">10</text>
    </svg>
)
const IconForward10 = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
        {/* Circular arrow arc pointing right/clockwise */}
        <path d="M18 13c0 3.31-2.69 6-6 6s-6-2.69-6-6 2.69-6 6-6v4l5-5-5-5v4c-4.42 0-8 3.58-8 8s3.58 8 8 8 8-3.58 8-8h-2z" />
        <text x="12" y="15.5" textAnchor="middle" fontSize="5.5" fontWeight="bold" fontFamily="system-ui, sans-serif" fill="currentColor">10</text>
    </svg>
)

// ─── HTML5 Custom Player (Cloudinary / direct .mp4 / HLS .m3u8) ─────────────
function HTML5Player({ src, poster, title, fallbackSrc }) {
    const videoRef = useRef(null)
    const containerRef = useRef(null)
    const progressRef = useRef(null)
    const hideControlsTimer = useRef(null)
    const hlsRef = useRef(null)

    const [playing, setPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [volume, setVolume] = useState(1)
    const [muted, setMuted] = useState(false)
    const [speed, setSpeed] = useState(1)
    const [fullscreen, setFullscreen] = useState(false)
    const [showControls, setShowControls] = useState(true)
    const [showBigPlay, setShowBigPlay] = useState(true)
    const [buffered, setBuffered] = useState(0)
    const [showSpeedMenu, setShowSpeedMenu] = useState(false)
    const [showQualityMenu, setShowQualityMenu] = useState(false)
    const [qualityLevels, setQualityLevels] = useState([])   // [{ label, index }]
    const [currentQuality, setCurrentQuality] = useState(-1) // -1 = Auto
    const [seeking, setSeeking] = useState(false)
    // src do elemento <video> controlado pelo React (não manipulação DOM direta)
    // Vazio para HLS em Chrome (hls.js usa MediaSource API)
    const [videoSrc, setVideoSrc] = useState(src?.includes('.m3u8') ? '' : (src || ''))

    const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

    // ── Resolve proxy URLs + HLS setup ───────────────────────────────────────────
    useEffect(() => {
        if (!src) return

        let cancelled = false

        const setup = async () => {
            let actualSrc = src
            if (src.startsWith('/api/videos/')) {
                try {
                    const res = await fetch(src, { headers: { Accept: 'application/json' } })
                    if (res.ok) {
                        const data = await res.json()
                        actualSrc = data.url
                    }
                } catch (e) {
                    console.error('[VideoPlayer] Failed to resolve presigned URL', e)
                }
            }
            if (cancelled) return

            const v = videoRef.current
            if (!v) return

            const isHLS = actualSrc?.includes('.m3u8')

            if (isHLS) {
                // Prioridade: hls.js (Chrome, Edge, Firefox) — expõe API de níveis para seletor de qualidade
                // Fallback: HLS nativo (Safari / iOS sem suporte a MSE)
                const Hls = (await import('hls.js')).default
                if (Hls.isSupported()) {
                    if (hlsRef.current) hlsRef.current.destroy()
                    const hls = new Hls()
                    // Popula o seletor de qualidade quando os níveis estiverem disponíveis
                    hls.on(Hls.Events.MANIFEST_PARSED, () => {
                        const levels = hls.levels.map((l, i) => ({
                            index: i,
                            label: l.height ? `${l.height}p` : `Level ${i + 1}`,
                        }))
                        levels.sort((a, b) => b.index - a.index)
                        setQualityLevels(levels)
                        setCurrentQuality(-1)
                    })
                    hls.on(Hls.Events.ERROR, (event, data) => {
                        if (data.fatal && data.type === Hls.ErrorTypes.NETWORK_ERROR && fallbackSrc) {
                            console.warn('[VideoPlayer] HLS fatal, fallback para MP4:', data.details)
                            hls.destroy()
                            hlsRef.current = null
                            setVideoSrc(fallbackSrc)
                            setQualityLevels([])
                        } else if (data.fatal && data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                            hls.recoverMediaError()
                        }
                    })
                    hls.loadSource(actualSrc)
                    hls.attachMedia(v)
                    hlsRef.current = hls
                } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
                    // Safari / iOS sem MSE: usa HLS nativo (sem seletor de qualidade)
                    setVideoSrc(actualSrc)
                }
            } else {
                // MP4/Cloudinary: React controla src via state
                setVideoSrc(actualSrc)
            }
        }

        setup()
        return () => {
            cancelled = true
            if (hlsRef.current) {
                hlsRef.current.destroy()
                hlsRef.current = null
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [src])

    // ── Video events ─────────────────────────────────────────────────────────
    useEffect(() => {
        const v = videoRef.current
        if (!v) return

        const onTimeUpdate = () => setCurrentTime(v.currentTime)
        const onDurationChange = () => setDuration(v.duration)
        const onPlay = () => { setPlaying(true); setShowBigPlay(false) }
        const onPause = () => setPlaying(false)
        const onEnded = () => { setPlaying(false); setShowBigPlay(true) }
        const onProgress = () => {
            if (v.buffered.length > 0) {
                setBuffered((v.buffered.end(v.buffered.length - 1) / v.duration) * 100)
            }
        }
        const onVolumeChange = () => {
            setVolume(v.volume)
            setMuted(v.muted)
        }

        v.addEventListener('timeupdate', onTimeUpdate)
        v.addEventListener('durationchange', onDurationChange)
        v.addEventListener('play', onPlay)
        v.addEventListener('pause', onPause)
        v.addEventListener('ended', onEnded)
        v.addEventListener('progress', onProgress)
        v.addEventListener('volumechange', onVolumeChange)

        return () => {
            v.removeEventListener('timeupdate', onTimeUpdate)
            v.removeEventListener('durationchange', onDurationChange)
            v.removeEventListener('play', onPlay)
            v.removeEventListener('pause', onPause)
            v.removeEventListener('ended', onEnded)
            v.removeEventListener('progress', onProgress)
            v.removeEventListener('volumechange', onVolumeChange)
        }
    }, [])

    // ── Fullscreen events ────────────────────────────────────────────────────
    useEffect(() => {
        const onChange = () => setFullscreen(!!document.fullscreenElement)
        document.addEventListener('fullscreenchange', onChange)
        return () => document.removeEventListener('fullscreenchange', onChange)
    }, [])

    // ── Keyboard shortcuts ───────────────────────────────────────────────────
    useEffect(() => {
        const onKey = (e) => {
            if (!containerRef.current?.contains(document.activeElement) && document.activeElement !== document.body) return
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
            switch (e.code) {
                case 'Space': case 'KeyK': e.preventDefault(); togglePlay(); break
                case 'ArrowLeft': e.preventDefault(); skip(-10); break
                case 'ArrowRight': e.preventDefault(); skip(10); break
                case 'KeyF': e.preventDefault(); toggleFullscreen(); break
                case 'KeyM': e.preventDefault(); toggleMute(); break
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playing, muted])

    // ── Controls auto-hide ────────────────────────────────────────────────────
    const resetHideTimer = useCallback(() => {
        setShowControls(true)
        clearTimeout(hideControlsTimer.current)
        hideControlsTimer.current = setTimeout(() => {
            if (playing) setShowControls(false)
        }, 2800)
    }, [playing])

    useEffect(() => {
        if (!playing) setShowControls(true)
        else resetHideTimer()
        return () => clearTimeout(hideControlsTimer.current)
    }, [playing, resetHideTimer])

    // ── Actions ───────────────────────────────────────────────────────────────
    const togglePlay = () => {
        const v = videoRef.current
        if (!v) return
        if (v.paused) v.play()
        else v.pause()
    }

    const skip = (secs) => {
        const v = videoRef.current
        if (!v) return
        v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + secs))
    }

    const toggleMute = () => {
        const v = videoRef.current
        if (!v) return
        v.muted = !v.muted
    }

    const setVolumeLevel = (val) => {
        const v = videoRef.current
        if (!v) return
        v.volume = val
        v.muted = val === 0
    }

    const setPlaybackSpeed = (s) => {
        const v = videoRef.current
        if (!v) return
        v.playbackRate = s
        setSpeed(s)
        setShowSpeedMenu(false)
    }

    const toggleFullscreen = async () => {
        const el = containerRef.current
        if (!el) return
        if (!document.fullscreenElement) await el.requestFullscreen()
        else await document.exitFullscreen()
    }

    // ── Progress bar interaction ──────────────────────────────────────────────
    const getSeekTime = useCallback((e) => {
        const bar = progressRef.current
        if (!bar || !duration) return 0
        const rect = bar.getBoundingClientRect()
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
        return (x / rect.width) * duration
    }, [duration])

    const onProgressMouseDown = (e) => {
        setSeeking(true)
        const t = getSeekTime(e)
        videoRef.current.currentTime = t
        setCurrentTime(t)
    }

    const onProgressMouseMove = useCallback((e) => {
        if (!seeking) return
        const t = getSeekTime(e)
        videoRef.current.currentTime = t
        setCurrentTime(t)
    }, [seeking, getSeekTime])

    const onProgressMouseUp = useCallback(() => setSeeking(false), [])

    useEffect(() => {
        if (seeking) {
            window.addEventListener('mousemove', onProgressMouseMove)
            window.addEventListener('mouseup', onProgressMouseUp)
        }
        return () => {
            window.removeEventListener('mousemove', onProgressMouseMove)
            window.removeEventListener('mouseup', onProgressMouseUp)
        }
    }, [seeking, onProgressMouseMove, onProgressMouseUp])

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div
            ref={containerRef}
            className="relative w-full aspect-video bg-black rounded-3xl overflow-hidden group select-none shadow-2xl"
            style={{ fontFamily: 'inherit' }}
            onMouseMove={resetHideTimer}
            onClick={() => { togglePlay(); resetHideTimer() }}
            tabIndex={0}
            onFocus={() => {}}
        >
            {/* ── Video Element ── */}
            {/* src controlado por videoSrc state — garante fallback via setVideoSrc */}
            {/* Para HLS em Chrome: videoSrc='' inicialmente, hls.js usa MediaSource */}
            <video
                ref={videoRef}
                src={videoSrc || undefined}
                poster={poster}
                className="w-full h-full object-contain"
                onClick={(e) => e.preventDefault()}
                preload="metadata"
                crossOrigin="anonymous"
            />

            {/* ── Gradient overlays ── */}
            <div
                className="absolute inset-0 pointer-events-none transition-opacity duration-300"
                style={{
                    background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 35%, transparent 60%, rgba(0,0,0,0.3) 100%)',
                    opacity: showControls ? 1 : 0,
                }}
            />

            {/* ── Big play overlay ── */}
            {showBigPlay && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div
                        className="w-20 h-20 rounded-full flex items-center justify-center"
                        style={{
                            background: 'linear-gradient(135deg, #16a34a, #15803d)',
                            boxShadow: '0 0 0 8px rgba(22,163,74,0.2), 0 8px 40px rgba(22,163,74,0.4)',
                        }}
                    >
                        <div className="w-8 h-8 text-white ml-1">
                            <IconPlay />
                        </div>
                    </div>
                </div>
            )}

            {/* ── Title bar ── */}
            {title && (
                <div
                    className="absolute top-0 left-0 right-0 px-5 pt-4 transition-opacity duration-300"
                    style={{ opacity: showControls ? 1 : 0 }}
                >
                    <p className="text-white text-sm font-semibold truncate drop-shadow-lg">{title}</p>
                </div>
            )}

            {/* ── Controls ── */}
            <div
                className="absolute bottom-0 left-0 right-0 px-4 pb-4 transition-opacity duration-300"
                style={{ opacity: showControls ? 1 : 0 }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Progress bar */}
                <div className="mb-3 flex items-center gap-2">
                    <span className="text-white text-xs tabular-nums opacity-80 min-w-[36px]">
                        {formatTime(currentTime)}
                    </span>

                    <div
                        ref={progressRef}
                        className="relative flex-1 h-1 rounded-full cursor-pointer group/progress"
                        style={{ background: 'rgba(255,255,255,0.2)' }}
                        onMouseDown={onProgressMouseDown}
                    >
                        {/* Buffered */}
                        <div
                            className="absolute left-0 top-0 h-full rounded-full"
                            style={{ width: `${buffered}%`, background: 'rgba(255,255,255,0.25)' }}
                        />
                        {/* Played */}
                        <div
                            className="absolute left-0 top-0 h-full rounded-full"
                            style={{
                                width: `${progress}%`,
                                background: 'linear-gradient(90deg, #16a34a, #4ade80)',
                            }}
                        />
                        {/* Thumb */}
                        <div
                            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full shadow-lg opacity-0 group-hover/progress:opacity-100 transition-opacity"
                            style={{
                                left: `${progress}%`,
                                background: '#fff',
                                boxShadow: '0 0 0 2px #16a34a',
                            }}
                        />
                    </div>

                    <span className="text-white text-xs tabular-nums opacity-60 min-w-[36px] text-right">
                        {formatTime(duration)}
                    </span>
                </div>

                {/* Buttons row */}
                <div className="flex items-center gap-2">
                    {/* Play/Pause */}
                    <button
                        onClick={togglePlay}
                        className="w-8 h-8 p-1.5 text-white rounded-lg hover:bg-white/10 transition-colors"
                        aria-label={playing ? 'Pausar' : 'Reproduzir'}
                    >
                        {playing ? <IconPause /> : <IconPlay />}
                    </button>

                    {/* Replay 10s */}
                    <button
                        onClick={() => skip(-10)}
                        className="w-7 h-7 p-1 text-white rounded-lg hover:bg-white/10 transition-colors"
                        aria-label="Voltar 10 segundos"
                    >
                        <IconReplay10 />
                    </button>

                    {/* Forward 10s */}
                    <button
                        onClick={() => skip(10)}
                        className="w-7 h-7 p-1 text-white rounded-lg hover:bg-white/10 transition-colors"
                        aria-label="Avançar 10 segundos"
                    >
                        <IconForward10 />
                    </button>

                    {/* Volume */}
                    <div className="flex items-center gap-1.5 group/vol">
                        <button
                            onClick={toggleMute}
                            className="w-7 h-7 p-1 text-white rounded-lg hover:bg-white/10 transition-colors"
                            aria-label={muted ? 'Ativar som' : 'Silenciar'}
                        >
                            {muted || volume === 0 ? <IconMute /> : <IconVolume />}
                        </button>
                        <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={muted ? 0 : volume}
                            onChange={(e) => setVolumeLevel(parseFloat(e.target.value))}
                            className="w-0 group-hover/vol:w-16 transition-all duration-200 overflow-hidden h-1 rounded-full cursor-pointer accent-green-500"
                            aria-label="Volume"
                        />
                    </div>

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Quality selector — só aparece para HLS com múltiplos níveis */}
                    {qualityLevels.length > 1 && (
                        <div className="relative">
                            <button
                                onClick={() => { setShowQualityMenu(p => !p); setShowSpeedMenu(false) }}
                                className="text-white text-xs font-bold px-2 py-1 rounded-lg hover:bg-white/10 transition-colors tabular-nums"
                                aria-label="Qualidade do vídeo"
                            >
                                {currentQuality === -1 ? 'Auto' : (qualityLevels.find(q => q.index === currentQuality)?.label ?? 'Auto')}
                            </button>
                            {showQualityMenu && (
                                <div
                                    className="absolute bottom-9 right-0 rounded-xl overflow-hidden shadow-2xl border"
                                    style={{
                                        background: 'rgba(15,23,42,0.95)',
                                        backdropFilter: 'blur(8px)',
                                        borderColor: 'rgba(255,255,255,0.1)',
                                        minWidth: '80px',
                                    }}
                                >
                                    {/* Opção Auto */}
                                    <button
                                        onClick={() => {
                                            if (hlsRef.current) hlsRef.current.currentLevel = -1
                                            setCurrentQuality(-1)
                                            setShowQualityMenu(false)
                                        }}
                                        className="block w-full text-right text-xs px-4 py-2 transition-colors"
                                        style={{
                                            color: currentQuality === -1 ? '#4ade80' : 'rgba(255,255,255,0.8)',
                                            background: currentQuality === -1 ? 'rgba(22,163,74,0.15)' : 'transparent',
                                        }}
                                        onMouseEnter={e => { if (currentQuality !== -1) e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
                                        onMouseLeave={e => { e.currentTarget.style.background = currentQuality === -1 ? 'rgba(22,163,74,0.15)' : 'transparent' }}
                                    >
                                        Auto
                                    </button>
                                    {/* Níveis específicos */}
                                    {qualityLevels.map(q => (
                                        <button
                                            key={q.index}
                                            onClick={() => {
                                                if (hlsRef.current) hlsRef.current.currentLevel = q.index
                                                setCurrentQuality(q.index)
                                                setShowQualityMenu(false)
                                            }}
                                            className="block w-full text-right text-xs px-4 py-2 transition-colors"
                                            style={{
                                                color: currentQuality === q.index ? '#4ade80' : 'rgba(255,255,255,0.8)',
                                                background: currentQuality === q.index ? 'rgba(22,163,74,0.15)' : 'transparent',
                                            }}
                                            onMouseEnter={e => { if (currentQuality !== q.index) e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
                                            onMouseLeave={e => { e.currentTarget.style.background = currentQuality === q.index ? 'rgba(22,163,74,0.15)' : 'transparent' }}
                                        >
                                            {q.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Speed */}
                    <div className="relative">
                        <button
                            onClick={() => { setShowSpeedMenu(p => !p); setShowQualityMenu(false) }}
                            className="text-white text-xs font-bold px-2 py-1 rounded-lg hover:bg-white/10 transition-colors tabular-nums"
                            aria-label="Velocidade de reprodução"
                        >
                            {speed === 1 ? '1×' : `${speed}×`}
                        </button>
                        {showSpeedMenu && (
                            <div
                                className="absolute bottom-9 right-0 rounded-xl overflow-hidden shadow-2xl border"
                                style={{
                                    background: 'rgba(15,23,42,0.95)',
                                    backdropFilter: 'blur(8px)',
                                    borderColor: 'rgba(255,255,255,0.1)',
                                    minWidth: '80px',
                                }}
                            >
                                {SPEEDS.map(s => (
                                    <button
                                        key={s}
                                        onClick={() => setPlaybackSpeed(s)}
                                        className="block w-full text-right text-xs px-4 py-2 transition-colors"
                                        style={{
                                            color: s === speed ? '#4ade80' : 'rgba(255,255,255,0.8)',
                                            background: s === speed ? 'rgba(22,163,74,0.15)' : 'transparent',
                                        }}
                                        onMouseEnter={e => { if (s !== speed) e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
                                        onMouseLeave={e => { e.currentTarget.style.background = s === speed ? 'rgba(22,163,74,0.15)' : 'transparent' }}
                                    >
                                        {s === 1 ? 'Normal' : `${s}×`}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Fullscreen */}
                    <button
                        onClick={toggleFullscreen}
                        className="w-7 h-7 p-1 text-white rounded-lg hover:bg-white/10 transition-colors"
                        aria-label={fullscreen ? 'Sair do modo tela cheia' : 'Tela cheia'}
                    >
                        {fullscreen ? <IconExitFullscreen /> : <IconFullscreen />}
                    </button>
                </div>
            </div>

            {/* ── Green accent border pulse on play ── */}
            <div
                className="absolute inset-0 rounded-3xl pointer-events-none transition-opacity duration-1000"
                style={{
                    boxShadow: playing ? 'inset 0 0 0 2px rgba(74,222,128,0.3)' : 'none',
                    opacity: playing ? 1 : 0,
                }}
            />
        </div>
    )
}

// ─── Exported Router ──────────────────────────────────────────────────────────
// Detects the URL type and delegates to the correct player automatically:
//   youtube.com / youtu.be  → YouTubePlayer  (free, no Cloudinary cost)
//   *.mp4 / cloudinary.com  → HTML5Player    (custom themed player)
//   anything else           → ExternalPlayer (generic fallback with link)
export default function VideoPlayer({ src, poster, title, fallbackSrc }) {
    const ytId = getYouTubeId(src)
    if (ytId) return <YouTubePlayer videoId={ytId} title={title} />
    if (src && !isDirectVideo(src)) return <ExternalPlayer src={src} title={title} />
    return <HTML5Player src={src} poster={poster} title={title} fallbackSrc={fallbackSrc} />
}
