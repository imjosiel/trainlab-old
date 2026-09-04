import { NextRequest } from 'next/server'
import { proxyToBackend } from '@/lib/bff'

type Ctx = { params: Promise<{ path?: string[] }> }

async function handler(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params
  return proxyToBackend(req, (path ?? []).join('/'))
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
export const OPTIONS = handler
