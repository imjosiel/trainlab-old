'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { toast } from 'sonner'
import { UploadCloud, Loader2, CheckCircle2 } from 'lucide-react'

/**
 * R2VideoUpload — Single upload to Cloudflare R2.
 *
 * After the upload completes, the save button in the parent submits the exercise.
 * The API then triggers a GH Actions webhook to asynchronously generate
 * thumb.jpg and teaser.mp4 via FFmpeg and upload them back to R2.
 *
 * Props:
 *   onUploadComplete({ videoUrl, originalKey, uploadId })
 *   onProcessingChange(bool)
 *   disabled
 */
export default function R2VideoUpload({ onUploadComplete, onProcessingChange, disabled }) {
    const [status, setStatus] = useState('idle') // idle | uploading | done | error
    const [progress, setProgress] = useState(0)

    const uploadFile = useCallback(async (file) => {
        onProcessingChange?.(true)
        setStatus('uploading')
        setProgress(0)

        try {
            // 1. Request presigned PUT URL from R2
            const signRes = await fetch('/api/backend/upload/r2-presign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    files: [{ field: 'video', name: file.name || 'video.mp4', type: file.type || 'video/mp4' }],
                }),
            })

            if (!signRes.ok) {
                const e = await signRes.json().catch(() => ({}))
                throw new Error(e.error || 'Falha ao obter permissão de envio')
            }

            const { uploadId, files } = await signRes.json()
            const r2File = files.find(f => f.field === 'video')
            if (!r2File) throw new Error('Resposta inválida do servidor')

            // 2. Upload directly to R2 via presigned PUT
            await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest()
                xhr.open('PUT', r2File.url)
                xhr.setRequestHeader('Content-Type', file.type || 'video/mp4')
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
                }
                xhr.onload = () => xhr.status >= 200 && xhr.status < 300
                    ? resolve()
                    : reject(new Error(`Upload falhou: HTTP ${xhr.status}`))
                xhr.onerror = () => reject(new Error('Erro de rede durante o envio'))
                xhr.send(file)
            })

            setProgress(100)
            setStatus('done')

            // videoUrl  → served via /api/backend/videos/... (R2 proxy)
            // originalKey → used by GH Actions to locate the file for processing
            onUploadComplete?.({
                uploadId,
                videoUrl: `/api/backend/videos/${r2File.key}`,
                originalKey: r2File.key,
            })

        } catch (err) {
            console.error('[R2_UPLOAD]', err)
            setStatus('error')
            toast.error(err.message || 'Erro ao enviar o vídeo')
        } finally {
            onProcessingChange?.(false)
        }
    }, [onUploadComplete, onProcessingChange])

    const onDrop = useCallback((accepted) => {
        const file = accepted[0]
        if (!file) return
        if (!file.type.startsWith('video/')) {
            toast.error('Envie apenas arquivos de vídeo.')
            return
        }
        uploadFile(file)
    }, [uploadFile])

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'video/*': ['.mp4', '.mov', '.avi', '.mkv', '.webm'] },
        maxFiles: 1,
        disabled: disabled || status === 'uploading',
    })

    if (status === 'done') {
        return (
            <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <div>
                    <p className="font-medium text-sm">Vídeo enviado! 🎉</p>
                    <p className="text-xs text-green-600 mt-0.5">Thumbnail e prévia serão gerados em instantes.</p>
                </div>
            </div>
        )
    }

    return (
        <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                isDragActive
                    ? 'border-green-500 bg-green-50'
                    : status === 'error'
                    ? 'border-red-300 bg-red-50'
                    : 'border-gray-300 bg-white hover:bg-gray-50 hover:border-gray-400'
            } ${disabled || status === 'uploading' ? 'pointer-events-none opacity-60' : ''}`}
        >
            <input {...getInputProps()} />

            {status === 'uploading' ? (
                <>
                    <Loader2 className="w-8 h-8 animate-spin text-green-500 mb-3" />
                    <p className="text-sm font-medium text-gray-700 mb-2">
                        Enviando para a nuvem... {progress}%
                    </p>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div
                            className="h-full bg-green-500 rounded-full transition-all duration-300"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </>
            ) : status === 'error' ? (
                <>
                    <span className="text-2xl mb-2">❌</span>
                    <p className="text-sm font-medium text-red-600">Erro no envio. Clique para tentar novamente.</p>
                </>
            ) : (
                <>
                    <UploadCloud className="w-8 h-8 text-gray-400 mb-2" />
                    <p className="text-sm font-medium text-gray-700">
                        {isDragActive ? 'Solte aqui!' : 'Arraste o vídeo ou clique para selecionar'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">MP4, MOV, AVI, MKV, WebM</p>
                </>
            )}
        </div>
    )
}
