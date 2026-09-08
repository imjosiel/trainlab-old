'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, Suspense } from 'react'

function AffiliateTrackerInner() {
  const searchParams = useSearchParams()

  useEffect(() => {
    const ref = searchParams.get('ref')
    if (!ref || ref.length > 100) return

    const cleaned = ref.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 50)
    if (!cleaned) return

    document.cookie = `affiliate_ref=${encodeURIComponent(cleaned)}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax; Secure`
  }, [searchParams])

  return null
}

export default function AffiliateTracker() {
  return (
    <Suspense fallback={null}>
      <AffiliateTrackerInner />
    </Suspense>
  )
}
