'use client'

import * as React from 'react'
import { Check, ChevronsUpDown, X, Loader2 } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { Badge } from '@/components/ui/badge'

export function TeamAutocomplete({ selectedTeams = [], onChange }) {
    const [query, setQuery] = useState('')
    const [suggestions, setSuggestions] = useState([])
    const [loading, setLoading] = useState(false)
    const [isOpen, setIsOpen] = useState(false)
    const wrapperRef = useRef(null)

    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [wrapperRef])

    useEffect(() => {
        if (query.trim().length < 2) {
            setSuggestions([])
            return
        }

        const fetchTeams = async () => {
            setLoading(true)
            try {
                const res = await fetch(`/api/backend/teams/search?q=${encodeURIComponent(query.trim())}`)
                const data = await res.json()
                setSuggestions(data.teams || [])
            } catch (e) {
                console.error(e)
            } finally {
                setLoading(false)
            }
        }

        const timeoutId = setTimeout(() => {
            fetchTeams()
        }, 300)

        return () => clearTimeout(timeoutId)
    }, [query])

    const addTeam = (teamName) => {
        const trimmed = teamName.trim()
        if (!trimmed) return

        if (!selectedTeams.some(t => t.toLowerCase() === trimmed.toLowerCase())) {
            onChange([...selectedTeams, trimmed])
        }
        setQuery('')
        setIsOpen(false)
    }

    const removeTeam = (teamToRemove) => {
        onChange(selectedTeams.filter(t => t !== teamToRemove))
    }

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            addTeam(query)
        }
    }

    return (
        <div className="w-full relative" ref={wrapperRef}>
            {selectedTeams.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                    {selectedTeams.map((team, idx) => (
                        <Badge key={idx} variant="secondary" className="flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 shadow-sm text-sm">
                            {team}
                            <X className="w-4 h-4 cursor-pointer text-green-500 hover:text-green-800" onClick={() => removeTeam(team)} />
                        </Badge>
                    ))}
                </div>
            )}

            <div className="relative">
                <input
                    type="text"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value)
                        setIsOpen(true)
                    }}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setIsOpen(true)}
                    placeholder={selectedTeams.length === 0 ? "Digite o nome do time para buscar ou criar..." : "Adicionar outro time..."}
                    className="flex h-12 w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50"
                />
                {loading && <Loader2 className="absolute right-4 top-3 h-6 w-6 animate-spin text-gray-400" />}
            </div>

            {isOpen && query.length > 0 && (
                <div className="absolute z-20 w-full mt-2 bg-white rounded-xl shadow-xl border border-gray-100 max-h-64 overflow-auto overflow-x-hidden">
                    {suggestions.length > 0 ? (
                        <ul className="py-2">
                            <li className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Times Encontrados</li>
                            {suggestions.map((team) => (
                                <li
                                    key={team.id}
                                    onClick={() => addTeam(team.name)}
                                    className="px-4 py-3 hover:bg-green-50 cursor-pointer text-base text-gray-900 transition-colors border-b border-gray-50 last:border-0"
                                >
                                    {team.name}
                                </li>
                            ))}
                            <li
                                onClick={() => addTeam(query)}
                                className="px-4 py-3 hover:bg-green-50 cursor-pointer text-base text-green-700 font-medium border-t border-gray-100 flex items-center gap-2 transition-colors"
                            >
                                <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-green-800 font-bold">+</div>
                                Adicionar novo time "{query}"
                            </li>
                        </ul>
                    ) : !loading && (
                        <div className="py-4 px-4 text-center">
                            <p className="text-gray-500 text-sm mb-2">Nenhum time encontrado com esse nome.</p>
                            <button
                                type="button"
                                onClick={() => addTeam(query)}
                                className="w-full py-2 px-4 bg-green-50 text-green-700 rounded-lg text-sm font-medium hover:bg-green-100 transition-colors border border-green-200"
                            >
                                Criar time "{query}"
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
