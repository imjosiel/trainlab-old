import { notFound } from 'next/navigation'
import OfferCheckoutClient from './checkout-client'

async function getOffer(id) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/backend/partner/offers/public/${id}`, { cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    return data.offer ?? null
}

// Página pública — aluno acessa o link da oferta e pode assinar
export async function generateMetadata({ params }) {
    const { id } = await params
    const offer = await getOffer(id)
    if (!offer) return { title: 'Oferta não encontrada' }
    return {
        title: `${offer.name} — ${offer.partner.user.name}`,
        description: offer.description,
    }
}

export default async function PublicOfferPage({ params }) {
    const { id } = await params
    const offer = await getOffer(id)
    if (!offer) notFound()
    return <OfferCheckoutClient offer={offer} />
}
