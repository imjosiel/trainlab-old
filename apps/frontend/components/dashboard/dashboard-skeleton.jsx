/**
 * components/dashboard/dashboard-skeleton.jsx
 * Exibido pelo <Suspense> enquanto o Server Component busca os dados.
 */
export default function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Título */}
      <div>
        <div className="h-8 bg-gray-200 rounded w-64 mb-2" />
        <div className="h-4 bg-gray-100 rounded w-48" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex justify-between mb-3">
              <div className="h-3 bg-gray-200 rounded w-24" />
              <div className="h-4 w-4 bg-gray-200 rounded" />
            </div>
            <div className="h-7 bg-gray-200 rounded w-16 mb-1" />
            <div className="h-3 bg-gray-100 rounded w-28" />
          </div>
        ))}
      </div>

      {/* Plano ativo (atleta) */}
      <div className="rounded-xl border border-green-100 bg-white p-5 shadow-sm">
        <div className="flex justify-between mb-4">
          <div className="h-5 bg-gray-200 rounded w-32" />
          <div className="h-5 bg-gray-200 rounded w-10" />
        </div>
        <div className="h-3 bg-gray-100 rounded w-48 mb-3" />
        <div className="h-2 bg-gray-200 rounded mb-4" />
        <div className="flex justify-between">
          <div className="h-3 bg-gray-100 rounded w-32" />
          <div className="h-3 bg-gray-100 rounded w-20" />
        </div>
      </div>

      {/* Ações rápidas + atividade */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[1, 2].map(i => (
          <div key={i} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="h-5 bg-gray-200 rounded w-32 mb-2" />
            <div className="h-3 bg-gray-100 rounded w-48 mb-5" />
            <div className="h-10 bg-gray-200 rounded mb-3" />
            <div className="h-10 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
