/**
 * Middleware Next.js — désactivé temporairement
 * La RLS est bypassée via service role key côté serveur
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Rediriger /login vers /support directement
  if (request.nextUrl.pathname === '/login') {
    return NextResponse.redirect(new URL('/support', request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/login'],
}
