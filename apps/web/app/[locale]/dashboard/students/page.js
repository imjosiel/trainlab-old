'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Users, Plus, Loader2, Mail, Calendar, Trophy, FileText, Send, Search, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'
import { ROLES } from '@/lib/constants'

export default function StudentsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  // Ensure the translation namespace is AthletesPage (since renaming translations takes longer, we'll keep the key for now)
  const t = useTranslations('AthletesPage')
  const locale = useLocale()
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [addingStudent, setAddingStudent] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [studentName, setStudentName] = useState('')
  const [studentEmail, setStudentEmail] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [availableSports, setAvailableSports] = useState([])
  const [selectedSport, setSelectedSport] = useState('')
  const [startingChat, setStartingChat] = useState(null) // studentId being started

  useEffect(() => {
    const userRoles = session?.user?.roles || []
    if (!userRoles.includes(ROLES.PROFESSIONAL)) {
      router.push('/dashboard')
      return
    }
    fetchStudents()
    fetchSports()
  }, [session])

  const fetchSports = async () => {
    try {
      const response = await fetch('/api/backend/sports')
      if (response.ok) {
        const data = await response.json()
        setAvailableSports(data.sports || [])
      }
    } catch (error) {
      console.error('Error fetching sports:', error)
    }
  }

  const fetchStudents = async () => {
    try {
      const response = await fetch('/api/backend/students')
      if (response.ok) {
        const data = await response.json()
        setStudents(data.students || [])
      }
    } catch (error) {
      console.error('Error fetching students:', error)
      toast.error(t('errorLoading'))
    } finally {
      setLoading(false)
    }
  }

  const handleAddStudent = async (e) => {
    e.preventDefault()
    setAddingStudent(true)

    try {
      const response = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: studentName, email: studentEmail || undefined, sportId: selectedSport }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || t('errorAddAthlete'))
      }

      toast.success(t('successAddAthlete'))
      setStudentName('')
      setStudentEmail('')
      setDialogOpen(false)
      fetchStudents()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setAddingStudent(false)
    }
  }

  const handleStartChat = async (student) => {
    if (!student.userId) return
    setStartingChat(student.id)
    try {
      const res = await fetch('/api/backend/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trainerId: session.user.id, studentId: student.userId }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      router.push('/dashboard/messages')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setStartingChat(null)
    }
  }

  const getInitials = (name) => {
    if (!name) return '?'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
          <p className="text-gray-600 mt-1">
            {t('subtitle')}
          </p>
        </div>

        <div className="flex gap-2">
          {/* Add user */}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-purple-600 hover:bg-purple-700">
                <Plus className="mr-2 h-4 w-4" />
                {t('btnAddAthlete')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleAddStudent}>
                <DialogHeader>
                  <DialogTitle>{t('dialogAddTitle')}</DialogTitle>
                  <DialogDescription>
                    {t('dialogAddDesc')}
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                  <div>
                    <Label htmlFor="name">Nome do Aluno</Label>
                    <Input
                      id="name"
                      type="text"
                      placeholder="João da Silva"
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      required
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email do Aluno (Opcional)</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="joao@example.com"
                      value={studentEmail}
                      onChange={(e) => setStudentEmail(e.target.value)}
                      className="mt-2 text-base sm:text-sm"
                    />
                  </div>
                  <div>
                    <Label htmlFor="sport">Esporte Principal *</Label>
                    <select
                      id="sport"
                      value={selectedSport}
                      onChange={(e) => setSelectedSport(e.target.value)}
                      required
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 mt-2 text-base sm:text-sm"
                    >
                      <option value="">Selecione um esporte...</option>
                      {availableSports.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {t('addHint')}
                  </p>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                    disabled={addingStudent}
                  >
                    {t('btnCancel')}
                  </Button>
                  <Button
                    type="submit"
                    className="bg-purple-600 hover:bg-purple-700"
                    disabled={addingStudent}
                  >
                    {addingStudent ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('btnAdding')}</>
                    ) : (
                      t('btnAdd')
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              {t('statsTotalTitle')}
            </CardTitle>
            <Users className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{students.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      {students.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <Input
            placeholder={t('searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {/* Students List */}
      {students.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="w-16 h-16 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {t('emptyTitle')}
            </h3>
            <p className="text-gray-600 mb-4 text-center max-w-md">
              {t('emptyDesc')}
            </p>
            <Button
              onClick={() => setDialogOpen(true)}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('btnFirstAthlete')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {students
            .filter(a =>
              !searchTerm ||
              a.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
              a.email?.toLowerCase().includes(searchTerm.toLowerCase())
            )
            .map((student) => (
              <Card key={student.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-center space-x-4">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={student.image} />
                      <AvatarFallback className="bg-purple-100 text-purple-600">
                        {getInitials(student.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <CardTitle className="text-lg">{student.name}</CardTitle>
                      {student.email && (
                        <CardDescription className="flex items-center text-xs">
                          <Mail className="w-3 h-3 mr-1" />
                          {student.email}
                        </CardDescription>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {student.profile ? (
                    <>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">{t('badgePosition')}</span>
                        <Badge variant="outline" className="capitalize">
                          {student.profile.position || t('badgeNA')}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">{t('badgeLevel')}</span>
                        <Badge variant="outline" className="capitalize">
                          {student.profile.technicalLevel || t('badgeNA')}
                        </Badge>
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-gray-500 italic">{t('badgeMissing')}</div>
                  )}

                  {/* Plan counts */}
                  {student.planCounts && (
                    <div className="flex gap-2 flex-wrap">
                      {student.planCounts.pending > 0 && (
                        <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                          {t('plansPending', { count: student.planCounts.pending })}
                        </span>
                      )}
                      {student.planCounts.active > 0 && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                          {t('plansActive', { count: student.planCounts.active })}
                        </span>
                      )}
                      {student.planCounts.completed > 0 && (
                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                          {t('plansCompleted', { count: student.planCounts.completed })}
                        </span>
                      )}
                      {student.planCounts.total === 0 && (
                        <span className="text-xs text-gray-400">{t('plansEmpty')}</span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center text-xs text-gray-500">
                    <Calendar className="w-3 h-3 mr-1" />
                    {t('sinceFormat', { date: new Date(student.since).toLocaleDateString(locale, { month: 'short', year: 'numeric' }) })}
                  </div>

                  <div className="pt-1 flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => router.push(`/dashboard/students/${student.id}`)}
                    >
                      <Trophy className="w-4 h-4 mr-1" />
                      {t('btnViewProfile')}
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1 bg-purple-600 hover:bg-purple-700"
                      onClick={() => router.push(`/dashboard/plans/create?studentId=${student.id}`)}
                    >
                      <FileText className="w-4 h-4 mr-1" />
                      {t('btnCreatePlan')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      title={student.userId ? 'Enviar mensagem' : 'Aluno sem conta vinculada'}
                      disabled={!student.userId || startingChat === student.id}
                      onClick={() => handleStartChat(student)}
                      className="px-2.5"
                    >
                      {startingChat === student.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <MessageSquare className="w-4 h-4" />}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      )}
    </div>
  )
}
