import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const raw = (body as Record<string, unknown>)?.email
  if (typeof raw !== 'string' || !EMAIL_RE.test(raw.trim())) {
    return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 })
  }

  const email = raw.trim().toLowerCase()

  // Use service role to bypass RLS — no authenticated session for public leads
  const supabase = await createClient(true)

  const { error } = await supabase.from('leads').insert({ email, source: 'homepage' })

  if (error) {
    // Unique violation = already subscribed
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Already subscribed.' }, { status: 409 })
    }
    console.error('[api/leads] insert error:', error.message)
    return NextResponse.json({ error: 'Failed to save. Try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
