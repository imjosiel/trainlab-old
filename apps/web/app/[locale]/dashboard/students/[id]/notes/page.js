'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, ArrowLeft, StickyNote, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

export default function StudentNotesPage() {
  const params = useParams()
  const router = useRouter()
  const studentId = params.id
  const [notes, setNotes] = useState([])
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  const fetchNotes = async () => {
    try {
      const res = await fetch(`/api/backend/students/${studentId}/notes`)
      if (!res.ok) throw new Error('Erro ao carregar anotações')
      const data = await res.json()
      setNotes(data.notes || [])
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }
  useEffect(() => { fetchNotes() }, [studentId])

  const handleCreate = async () => {
    if (!content.trim()) { toast.error('Digite a anotação'); return }
    setCreating(true)
    try {
      const res = await fetch(`/api/backend/students/${studentId}/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Anotação criada')
      setContent('')
      fetchNotes()
    } catch (e) { toast.error(e.message) } finally { setCreating(false) }
  }
  const handleDelete = async (noteId) => {
    if (!confirm('Remover anotação?')) return
    try {
      const res = await fetch(`/api/backend/students/${studentId}/notes/${noteId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Erro ao remover')
      toast.success('Removida')
      setNotes(notes.filter(n => n.id !== noteId))
    } catch (e) { toast.error(e.message) }
  }

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => router.push(`/dashboard/students/${studentId}`)}><ArrowLeft className="w-4 h-4 mr-2" />Voltar</Button>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><StickyNote className="w-5 h-5" />Anotações RAG ({notes.length})</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Textarea value={content} onChange={e=>setContent(e.target.value)} placeholder="Ex: Aluno melhorou agilidade, mas reclamou de dor no joelho..." rows={3} maxLength={2000} />
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-500">{content.length}/2000</span>
            <Button onClick={handleCreate} disabled={creating || !content.trim()}>{creating ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : null}Salvar anotação</Button>
          </div>
        </CardContent>
      </Card>
      <div className="space-y-3">
        {notes.length===0 ? <p className="text-center text-gray-500 text-sm py-8">Nenhuma anotação ainda. As 3 últimas alimentam a IA na próxima geração.</p> :
          notes.map(n=>(
            <Card key={n.id}>
              <CardContent className="pt-4 flex justify-between gap-4">
                <div>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{n.content}</p>
                  <p className="text-xs text-gray-400 mt-1">{new Date(n.createdAt).toLocaleString('pt-BR')}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={()=>handleDelete(n.id)}><Trash2 className="w-4 h-4 text-red-500"/></Button>
              </CardContent>
            </Card>
          ))}
      </div>
    </div>
  )
}
