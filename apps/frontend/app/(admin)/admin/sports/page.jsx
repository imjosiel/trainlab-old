"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { Plus, Medal, Loader2, AlertCircle } from "lucide-react"

export default function SportsManagementPage() {
    const { data: session } = useSession()
    const [sports, setSports] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Form State
    const [name, setName] = useState("")
    const [slug, setSlug] = useState("")

    useEffect(() => {
        fetchSports()
    }, [])

    const fetchSports = async () => {
        try {
            const res = await fetch("/api/backend/admin/sports")
            if (!res.ok) throw new Error("Falha ao carregar esportes")
            const data = await res.json()
            setSports(data)
        } catch (error) {
            toast.error("Erro ao carregar lista de esportes")
        } finally {
            setIsLoading(false)
        }
    }

    const handleNameChange = (val) => {
        setName(val)
        // Auto generate slug
        const generatedSlug = val
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9\s-]/g, "")
            .replace(/\s+/g, "-")

        setSlug(generatedSlug)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!name || !slug) return

        setIsSubmitting(true)
        try {
            const res = await fetch("/api/backend/admin/sports", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, slug }),
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || "Erro ao adicionar esporte")
            }

            toast.success("Esporte adicionado com sucesso!")
            setSports((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
            setIsDialogOpen(false)
            setName("")
            setSlug("")
        } catch (error) {
            toast.error(error.message)
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Gerenciar Esportes</h1>
                    <p className="text-muted-foreground mt-2">
                        Adicione e gerencie os esportes disponíveis para os perfis dos atletas.
                    </p>
                </div>

                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Adicionar Esporte
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                        <form onSubmit={handleSubmit}>
                            <DialogHeader>
                                <DialogTitle>Adicionar Novo Esporte</DialogTitle>
                                <DialogDescription>
                                    Crie um novo esporte global para a plataforma. O slug (URL) é gerado automaticamente.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="name">Nome do Esporte</Label>
                                    <Input
                                        id="name"
                                        placeholder="Ex: Futebol de Areia"
                                        value={name}
                                        onChange={(e) => handleNameChange(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="slug">Slug (Identificador Único)</Label>
                                    <Input
                                        id="slug"
                                        value={slug}
                                        onChange={(e) => setSlug(e.target.value)}
                                        required
                                        readOnly
                                        className="bg-muted"
                                    />
                                    <p className="text-xs text-muted-foreground">O slug não pode ser alterado depois.</p>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                                    Cancelar
                                </Button>
                                <Button type="submit" disabled={isSubmitting || !name || !slug}>
                                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Salvar Esporte
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Esporte</TableHead>
                            <TableHead>Slug</TableHead>
                            <TableHead>Atletas Vinculados</TableHead>
                            <TableHead>Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={4} className="h-24 text-center">
                                    <div className="flex justify-center items-center">
                                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : sports.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                    Nenhum esporte cadastrado. Clique no botão acima para adicionar.
                                </TableCell>
                            </TableRow>
                        ) : (
                            sports.map((sport) => (
                                <TableRow key={sport.id}>
                                    <TableCell className="font-medium flex items-center gap-2">
                                        <Medal className="h-4 w-4 text-muted-foreground" />
                                        {sport.name}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs text-muted-foreground">{sport.slug}</TableCell>
                                    <TableCell>{sport._count?.profiles || 0}</TableCell>
                                    <TableCell>
                                        {sport.isActive ? (
                                            <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-primary/10 text-primary">
                                                Ativo
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-muted text-muted-foreground">
                                                Inativo
                                            </span>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="rounded-lg border bg-amber-500/10 p-4 text-amber-500 flex gap-3 dark:bg-amber-500/5 items-start">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <div className="text-sm">
                    <strong>Aviso de Segurança:</strong> As rotas de criação e edição aqui são protegidas no backend.
                    Qualquer tentativa de criar via Postman sem a sessão de <code className="bg-amber-500/20 px-1 rounded">ADMIN</code> será bloqueada.
                </div>
            </div>
        </div>
    )
}
