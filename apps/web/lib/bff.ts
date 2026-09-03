import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3001'

/**
 * Prefixos (relativos a `/api/backend/`) que atravessam sem sessão.
 *
 * Espelham as rotas `@Public()` do Nest que o navegador precisa alcançar sem
 * login. Generoso de propósito: o Nest continua aplicando o próprio guard —
 * prefixo a mais só faz o Nest responder o 401 dele, nunca abre nada.
 * Prefixo a menos quebra fluxo de guest (checkout B2B, link mágico de
 * agendamento, oferta pública), então na dúvida inclui.
 */
export const PUBLIC_PREFIXES = [
  'health',
  'sports',
  'public',
  'users/public',
  'invite',
  'appointments/confirm',
  'partner/offers',
  'stripe/checkout-b2b',
  'stripe/checkout-status',
  'stripe/webhook-b2b',
  'stripe/webhook-credits',
  'stripe/webhook-connect',
]

export function isPublicPath(path: string): boolean {
  return PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p + '/'))
}

/**
 * BFF: cookie de sessão → Bearer → Nest (D6 de
 * `docs/implementation-plans/epic-backend-nest.md`).
 *
 * O BFF encaminha o token BRUTO (`getToken({ raw: true })`) e nunca interpreta
 * a sessão — o backend é o único que a interpreta. O BFF também não é ponto de
 * autorização: repassa e devolve. Autorização mora no backend.
 */
export async function proxyToBackend(
  req: NextRequest,
  path: string,
  opts?: { requireAuth?: boolean },
): Promise<NextResponse> {
  const requireAuth = opts?.requireAuth ?? true

  const rawToken = await getToken({
    req: req as unknown as Parameters<typeof getToken>[0]['req'],
    secret: process.env.NEXTAUTH_SECRET,
    raw: true,
  }).catch(() => null)

  // Portão do BFF: sem sessão em rota não-pública, nega sem chegar ao Nest.
  if (requireAuth && !isPublicPath(path) && !rawToken) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const url = `${BACKEND_URL}/${path}${req.nextUrl.search}`

  // Allowlist de headers: o cookie de sessão NÃO atravessa (o Nest só lê
  // Bearer; repassar cookie seria vazar credencial sem uso).
  const headers: Record<string, string> = {}
  const contentType = req.headers.get('content-type')
  if (contentType) headers['content-type'] = contentType
  const accept = req.headers.get('accept')
  if (accept) headers['accept'] = accept
  if (typeof rawToken === 'string' && rawToken) {
    headers['authorization'] = `Bearer ${rawToken}`
  }
  // Atribuição de afiliado (cookie `affiliate_ref` do AffiliateTracker):
  // o Bearer é stateless, então o ref viaja como header explícito.
  const affiliateRef = req.cookies.get('affiliate_ref')?.value
  if (affiliateRef) headers['x-affiliate-ref'] = affiliateRef

  let body: BodyInit | undefined
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const buf = await req.arrayBuffer()
    // Bytes crus (não `req.json()`): preserva multipart (upload de imagem) e
    // a assinatura dos webhooks byte a byte.
    if (buf.byteLength > 0) body = Buffer.from(buf)
  }

  let backendRes: Response
  try {
    backendRes = await fetch(url, {
      method: req.method,
      headers,
      body,
      // O BFF nunca segue redirect do Nest — entrega ao navegador decidir.
      redirect: 'manual',
    })
  } catch {
    return NextResponse.json(
      { error: 'Serviço indisponível. Tente novamente.' },
      { status: 502 },
    )
  }

  // D7 — não presume JSON: binário (PDF, export CSV, vídeo) volta como bytes
  // com os headers preservados.
  const resContentType = backendRes.headers.get('content-type') ?? ''
  if (!resContentType.includes('application/json')) {
    const bytes = await backendRes.arrayBuffer()
    const outHeaders: Record<string, string> = {
      'content-type': resContentType || 'application/octet-stream',
    }
    const disposition = backendRes.headers.get('content-disposition')
    if (disposition) outHeaders['content-disposition'] = disposition
    const location = backendRes.headers.get('location')
    if (location) outHeaders['location'] = location
    return new NextResponse(bytes, {
      status: backendRes.status,
      headers: outHeaders,
    })
  }

  // Erro do Nest (400/404/…) é repassado com o corpo nativo intacto,
  // não reembalado.
  const data = await backendRes.json().catch(() => null)
  return NextResponse.json(data, { status: backendRes.status })
}
