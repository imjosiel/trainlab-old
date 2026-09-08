'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import {
    Bold, Italic, Heading2, Heading3, List, ListOrdered,
    Link as LinkIcon, Image as ImageIcon, Undo, Redo, Minus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRef, useCallback, useEffect } from 'react'
import { toast } from 'sonner'

// Botão da toolbar
function ToolbarButton({ onClick, active, title, children, disabled }) {
    return (
        <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onClick() }}
            disabled={disabled}
            title={title}
            className={`p-1.5 rounded text-sm transition-colors ${
                active
                    ? 'bg-green-100 text-green-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            } disabled:opacity-40`}
        >
            {children}
        </button>
    )
}

export default function RichEditor({ content = '', onChange, placeholder = 'Escreva a descrição do exercício...', readOnly = false }) {
    const fileInputRef = useRef(null)

    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit.configure({
                heading: { levels: [2, 3] },
            }),
            Image.configure({ allowBase64: false, inline: false }),
            Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-green-600 underline' } }),
            Placeholder.configure({ placeholder }),
        ],
        content,
        editable: !readOnly,
        onUpdate({ editor }) {
            onChange?.(editor.getHTML())
        },
        editorProps: {
            attributes: {
                class: 'prose prose-sm max-w-none focus:outline-none min-h-[200px] px-4 py-3',
            },
            // Bloqueia paste de base64
            transformPastedHTML(html) {
                return html.replace(/<img[^>]+src="data:[^"]*"[^>]*>/gi, '')
            },
        },
    })

    // Upload de imagem via R2
    const handleImageUpload = useCallback(async (file) => {
        if (!file || !file.type.startsWith('image/')) return
        if (file.size > 5 * 1024 * 1024) { toast.error('Imagem muito grande. Máximo 5MB.'); return }
        try {
            const formData = new FormData()
            formData.append('file', file)
            const res = await fetch('/api/backend/upload/image', { method: 'POST', body: formData })
            if (!res.ok) throw new Error('Erro no upload')
            const data = await res.json()
            editor?.chain().focus().setImage({ src: data.url }).run()
        } catch {
            toast.error('Erro ao fazer upload da imagem.')
        }
    }, [editor])

    const setLink = useCallback(() => {
        const url = window.prompt('URL do link:')
        if (!url) return
        // Rejeitar protocolos perigosos (XSS via javascript: ou data: URIs)
        const normalized = url.trim().toLowerCase()
        if (normalized.startsWith('javascript:') || normalized.startsWith('data:')) {
            alert('URL inválida. Use apenas links http:// ou https://')
            return
        }
        editor?.chain().focus().setLink({ href: url, target: '_blank' }).run()
    }, [editor])

    // Sincroniza o conteúdo quando o prop `content` muda após montagem
    // Necessário pois o edit/page.js carrega dados assincronamente
    // emitUpdate=false evita loop: setContent→onUpdate→onChange→setForm→content→setContent
    useEffect(() => {
        if (!editor || readOnly) return
        const current = editor.getHTML()
        if (content !== current && content !== undefined) {
            editor.commands.setContent(content || '', false)
        }
    }, [content]) // eslint-disable-line react-hooks/exhaustive-deps

    if (!editor) return null

    return (
        <div className={`border rounded-lg overflow-hidden bg-white ${readOnly ? '' : 'border-gray-200'}`}>
            {!readOnly && (
                <div className="flex flex-wrap items-center gap-0.5 p-2 border-b bg-gray-50">
                    <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Negrito">
                        <Bold className="w-4 h-4" />
                    </ToolbarButton>
                    <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Itálico">
                        <Italic className="w-4 h-4" />
                    </ToolbarButton>

                    <div className="w-px h-5 bg-gray-200 mx-1" />

                    <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Título">
                        <Heading2 className="w-4 h-4" />
                    </ToolbarButton>
                    <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Subtítulo">
                        <Heading3 className="w-4 h-4" />
                    </ToolbarButton>

                    <div className="w-px h-5 bg-gray-200 mx-1" />

                    <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Lista">
                        <List className="w-4 h-4" />
                    </ToolbarButton>
                    <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Lista numerada">
                        <ListOrdered className="w-4 h-4" />
                    </ToolbarButton>

                    <div className="w-px h-5 bg-gray-200 mx-1" />

                    <ToolbarButton onClick={setLink} active={editor.isActive('link')} title="Inserir link">
                        <LinkIcon className="w-4 h-4" />
                    </ToolbarButton>
                    <ToolbarButton onClick={() => fileInputRef.current?.click()} title="Inserir imagem">
                        <ImageIcon className="w-4 h-4" />
                    </ToolbarButton>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleImageUpload(e.target.files?.[0])}
                    />

                    <div className="w-px h-5 bg-gray-200 mx-1" />

                    <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Separador">
                        <Minus className="w-4 h-4" />
                    </ToolbarButton>

                    <div className="flex-1" />

                    <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Desfazer">
                        <Undo className="w-4 h-4" />
                    </ToolbarButton>
                    <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Refazer">
                        <Redo className="w-4 h-4" />
                    </ToolbarButton>
                </div>
            )}
            <EditorContent editor={editor} />
        </div>
    )
}
