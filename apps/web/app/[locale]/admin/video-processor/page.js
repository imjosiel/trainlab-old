'use client'

import { ADMIN_SYSTEM_ROLES } from '@/lib/constants'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { getFFmpeg } from '@/lib/ffmpeg-singleton'

// ─── Status helpers ───────────────────────────────────────────────────────────
const STATUS = {
    idle:        { label: 'Aguardando',            color: 'text-gray-400',  bg: 'bg-gray-100' },
    downloading: { label: 'Baixando vídeo...',     color: 'text-blue-600',  bg: 'bg-blue-50' },
    converting:  { label: 'Convertendo para HLS...', color: 'text-yellow-600', bg: 'bg-yellow-50' },
    uploading:   { label: 'Enviando para R2...',   color: 'text-purple-600', bg: 'bg-purple-50' },
    saving:      { label: 'Salvando no banco...',  color: 'text-orange-500', bg: 'bg-orange-50' },
    done:        { label: '✅ Concluído',           color: 'text-green-600', bg: 'bg-green-50' },
    error:       { label: '❌ Erro',                color: 'text-red-600',   bg: 'bg-red-50' },
}

export default function VideoProcessorPage() {
    const { data: session } = useSession()
    const [pending, setPending] = useState([])
    const [loading, setLoading] = useState(true)
    const [running, setRunning] = useState(false)
    const [jobStatus, setJobStatus] = useState({}) // { [exerciseId]: { status, progress, error } }
    const stopRef = useRef(false)

    const isAdmin = session?.user?.systemRoles?.some(r => ADMIN_SYSTEM_ROLES.includes(r))

    // ── Fetch pending list ────────────────────────────────────────────────────
    const fetchPending = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/backend/admin/video-processor')
            if (!res.ok) throw new Error('Erro ao buscar lista')
            const data = await res.json()
            setPending(data.pending)
            // Initialize job status
            const initial = {}
            data.pending.forEach(ex => { initial[ex.id] = { status: 'idle', progress: 0 } })
            setJobStatus(initial)
        } catch (e) {
            toast.error(e.message)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { if (isAdmin) fetchPending() }, [isAdmin, fetchPending])

    // ── Update job status helper ──────────────────────────────────────────────
    const updateJob = (id, patch) =>
        setJobStatus(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))

    // ── Process a single exercise ─────────────────────────────────────────────
    const processExercise = useCallback(async (exercise) => {
        const { id, name, videoUrl, videoPublicId } = exercise
        updateJob(id, { status: 'downloading', progress: 0 })

        try {
            // 1. Resolve presigned GET URL for the MP4 (videoUrl = /api/videos/...mp4)
            const resolveRes = await fetch(videoUrl)
            if (!resolveRes.ok) throw new Error('Falha ao resolver URL do vídeo')
            const { url: presignedGetUrl } = await resolveRes.json()

            // 2. Download MP4 into browser memory
            const videoResponse = await fetch(presignedGetUrl)
            if (!videoResponse.ok) throw new Error('Falha ao baixar vídeo do R2')
            const videoBuffer = new Uint8Array(await videoResponse.arrayBuffer())
            updateJob(id, { progress: 20 })

            // 3. Get FFmpeg (uses singleton — may already be loaded)
            const { ffmpeg, fetchFile } = await getFFmpeg()
            updateJob(id, { status: 'converting', progress: 25 })

            // 4. Write MP4 to FFmpeg virtual FS and convert to HLS
            await ffmpeg.writeFile('input.mp4', videoBuffer)

            ffmpeg.on('progress', ({ progress: p }) => {
                updateJob(id, { progress: 25 + Math.round(p * 40) }) // 25→65%
            })

            await ffmpeg.exec([
                '-i', 'input.mp4',
                '-c:v', 'libx264',
                '-c:a', 'aac',
                '-hls_time', '4',
                '-hls_list_size', '0',
                '-hls_segment_filename', 'seg_%03d.ts',
                '-preset', 'ultrafast',
                '-crf', '28',
                'master.m3u8'
            ])
            ffmpeg.off('progress')
            updateJob(id, { progress: 65 })

            // Read HLS output
            const manifestData = await ffmpeg.readFile('master.m3u8')
            const manifestText = new TextDecoder().decode(manifestData)
            const segmentNames = manifestText.match(/seg_\d+\.ts/g) || []

            // 5. Get presigned PUT URLs for all HLS files
            updateJob(id, { status: 'uploading', progress: 68 })

            // Extract trainerId and uploadId from original key path: exercises/trainerId/uploadId/original.mp4
            const keyParts = videoPublicId.split('/')
            const trainerId = keyParts[1] || 'unknown'
            const uploadId = keyParts[2] || id

            const filesToPresign = [
                { field: 'manifest', name: 'master.m3u8', type: 'application/x-mpegURL' },
                ...segmentNames.map(seg => ({ field: `seg:${seg}`, name: seg, type: 'video/MP2T' })),
            ]

            const presignRes = await fetch('/api/backend/upload/r2-presign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: filesToPresign }),
            })
            if (!presignRes.ok) throw new Error('Falha ao obter URLs de upload')
            const { files: presigned } = await presignRes.json()

            // 6. Upload HLS chunks to R2
            let uploaded = 0
            const total = presigned.length

            await Promise.all(presigned.map(async ({ field, key, url }) => {
                let blob
                if (field === 'manifest') {
                    blob = new Blob([manifestData], { type: 'application/x-mpegURL' })
                } else {
                    const segName = field.replace('seg:', '')
                    const segData = await ffmpeg.readFile(segName)
                    blob = new Blob([segData], { type: 'video/MP2T' })
                }

                await fetch(url, { method: 'PUT', body: blob, headers: { 'Content-Type': blob.type } })
                uploaded++
                updateJob(id, { progress: 68 + Math.round((uploaded / total) * 22) }) // 68→90%
            }))

            // 7. Save to DB
            updateJob(id, { status: 'saving', progress: 92 })
            const manifestKey = presigned.find(f => f.field === 'manifest')?.key
            const hlsVideoUrl = `/api/videos/${manifestKey}`

            const patchRes = await fetch('/api/backend/admin/video-processor', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id,
                    hlsVideoUrl,
                    hlsManifestKey: manifestKey,
                    originalVideoKey: videoPublicId,
                }),
            })
            if (!patchRes.ok) throw new Error('Falha ao salvar no banco')

            // 8. Cleanup FFmpeg FS
            await ffmpeg.deleteFile('input.mp4').catch(() => {})
            await ffmpeg.deleteFile('master.m3u8').catch(() => {})
            for (const seg of segmentNames) await ffmpeg.deleteFile(seg).catch(() => {})

            updateJob(id, { status: 'done', progress: 100 })
        } catch (err) {
            console.error(`[PROCESSOR] Exercise ${id}:`, err)
            updateJob(id, { status: 'error', progress: 0, error: err.message })
        }
    }, [])

    // ── Run all pending sequentially ──────────────────────────────────────────
    const runAll = useCallback(async () => {
        setRunning(true)
        stopRef.current = false
        const toProcess = pending.filter(ex => jobStatus[ex.id]?.status !== 'done')

        for (const exercise of toProcess) {
            if (stopRef.current) break
            await processExercise(exercise)
        }

        setRunning(false)
        toast.success('Processamento concluído!')
    }, [pending, jobStatus, processExercise])

    const stop = () => { stopRef.current = true }

    if (!isAdmin) return (
        <div className="p-8 text-center text-gray-500">Acesso restrito a administradores.</div>
    )

    const doneCount = Object.values(jobStatus).filter(j => j.status === 'done').length
    const errorCount = Object.values(jobStatus).filter(j => j.status === 'error').length

    return (
        <div className="p-6 max-w-4xl mx-auto">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">🎬 Processador de Vídeos HLS</h1>
                <p className="text-sm text-gray-500 mt-1">
                    Converte vídeos MP4 pendentes para HLS usando o FFmpeg no <strong>seu navegador</strong>.
                    Todo o processamento acontece na sua RAM — zero custo de servidor.
                </p>
            </div>

            {/* Stats */}
            {!loading && (
                <div className="grid grid-cols-4 gap-4 mb-6">
                    {[
                        { label: 'Pendentes', value: pending.length, color: 'text-gray-700' },
                        { label: 'Concluídos', value: doneCount, color: 'text-green-600' },
                        { label: 'Erros', value: errorCount, color: 'text-red-600' },
                        { label: 'Restantes', value: pending.length - doneCount - errorCount, color: 'text-blue-600' },
                    ].map(s => (
                        <div key={s.label} className="bg-white border rounded-xl p-4 text-center shadow-sm">
                            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Controls */}
            <div className="flex gap-3 mb-6">
                <button
                    onClick={runAll}
                    disabled={running || pending.length === 0 || loading}
                    className="px-5 py-2.5 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {running ? '⏳ Processando...' : '▶ Iniciar Processamento'}
                </button>
                {running && (
                    <button
                        onClick={stop}
                        className="px-5 py-2.5 rounded-lg bg-red-100 text-red-700 text-sm font-semibold hover:bg-red-200 transition-colors"
                    >
                        ⏹ Parar após atual
                    </button>
                )}
                <button
                    onClick={fetchPending}
                    disabled={running || loading}
                    className="px-5 py-2.5 rounded-lg bg-gray-100 text-gray-700 text-sm font-semibold hover:bg-gray-200 disabled:opacity-50 transition-colors"
                >
                    🔄 Atualizar lista
                </button>
            </div>

            {/* Exercise list */}
            {loading ? (
                <div className="text-center py-12 text-gray-400">Carregando exercícios pendentes...</div>
            ) : pending.length === 0 ? (
                <div className="text-center py-12 bg-green-50 rounded-xl border border-green-200">
                    <p className="text-green-700 font-medium">✅ Nenhum vídeo pendente de conversão!</p>
                    <p className="text-green-500 text-sm mt-1">Todos os exercícios já estão em HLS.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {pending.map(exercise => {
                        const job = jobStatus[exercise.id] || { status: 'idle', progress: 0 }
                        const st = STATUS[job.status]
                        return (
                            <div key={exercise.id} className={`border rounded-xl p-4 ${st.bg} transition-colors`}>
                                <div className="flex items-center justify-between mb-2">
                                    <div>
                                        <p className="text-sm font-semibold text-gray-800">{exercise.name}</p>
                                        <p className="text-xs text-gray-400 font-mono truncate max-w-md">
                                            {exercise.videoPublicId}
                                        </p>
                                    </div>
                                    <span className={`text-xs font-semibold px-2 py-1 rounded-full bg-white ${st.color}`}>
                                        {st.label}
                                    </span>
                                </div>

                                {/* Progress bar */}
                                {job.status !== 'idle' && job.status !== 'done' && (
                                    <div className="mt-2">
                                        <div className="w-full bg-white/60 rounded-full h-1.5 overflow-hidden">
                                            <div
                                                className="h-full rounded-full transition-all duration-300"
                                                style={{
                                                    width: `${job.progress}%`,
                                                    background: job.status === 'error'
                                                        ? '#ef4444'
                                                        : 'linear-gradient(90deg, #16a34a, #4ade80)',
                                                }}
                                            />
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1 text-right">{job.progress}%</p>
                                    </div>
                                )}

                                {job.error && (
                                    <p className="text-xs text-red-600 mt-1 bg-red-50 rounded p-1">{job.error}</p>
                                )}

                                {/* Manual process button */}
                                {!running && job.status !== 'done' && (
                                    <button
                                        onClick={() => processExercise(exercise)}
                                        className="mt-2 text-xs text-blue-600 hover:underline"
                                    >
                                        Processar individualmente
                                    </button>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

