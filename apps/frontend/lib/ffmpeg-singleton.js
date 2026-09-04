/**
 * FFmpeg WASM Singleton
 *
 * Mantém uma única instância do FFmpeg compartilhada entre a página de
 * biblioteca (pré-carregamento idle) e o componente R2VideoUpload (uso real).
 * Evita carregar o WASM duas vezes e elimina o delay no primeiro upload.
 */

let ffmpegInstance = null
let loadPromise = null

export async function getFFmpeg() {
    // Já carregado — retorna na hora
    if (ffmpegInstance) return ffmpegInstance

    // Já está carregando — aguarda a mesma promise (sem duplicatas)
    if (loadPromise) return loadPromise

    loadPromise = (async () => {
        const { FFmpeg } = await import('@ffmpeg/ffmpeg')
        const { fetchFile, toBlobURL } = await import('@ffmpeg/util')

        const ffmpeg = new FFmpeg()

        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
        await ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        })

        ffmpegInstance = { ffmpeg, fetchFile }
        return ffmpegInstance
    })()

    return loadPromise
}

/**
 * Pré-carrega o FFmpeg em background, sem bloquear a UI.
 * Usa requestIdleCallback para aproveitar o tempo ocioso do browser.
 * Seguro chamar múltiplas vezes — o singleton garante que carrega só uma vez.
 */
export function preloadFFmpeg() {
    if (typeof window === 'undefined') return   // SSR guard
    if (ffmpegInstance) return                  // Já carregado

    const load = () => {
        getFFmpeg().catch(() => {
            // Falha silenciosa no pré-carregamento — usuário verá o loading normalmente
        })
    }

    if ('requestIdleCallback' in window) {
        window.requestIdleCallback(load, { timeout: 5000 })
    } else {
        // Fallback para Safari (não suporta requestIdleCallback)
        setTimeout(load, 2000)
    }
}
