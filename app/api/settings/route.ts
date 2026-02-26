import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const DEV = process.env.NODE_ENV === 'development'
const VALID_PLANS = ['free', 'pro', 'max'] as const

export async function PATCH(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { display_name?: string | null; plan_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const update: Record<string, string | null> = {}

  if ('display_name' in body) {
    const dn = body.display_name
    if (dn !== null && typeof dn !== 'string') {
      return NextResponse.json({ error: 'display_name must be a string or null' }, { status: 400 })
    }
    // Trim and cap at 80 chars; empty string → null
    update.display_name = typeof dn === 'string' ? dn.trim().slice(0, 80) || null : null
  }

  if ('plan_id' in body) {
    if (!VALID_PLANS.includes(body.plan_id as typeof VALID_PLANS[number])) {
      return NextResponse.json({ error: 'Invalid plan_id' }, { status: 400 })
    }
    update.plan_id = body.plan_id!
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  // Service role for the write — this is always the user's own row
  const serviceClient = await createClient(true)
  const { error } = await serviceClient
    .from('profiles')
    .update(update)
    .eq('id', user.id)

  if (error) {
    if (DEV) console.error('[api/settings] update error:', error)
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }

  if (DEV) console.log('[api/settings] updated', { userId: user.id, fields: Object.keys(update) })

  return NextResponse.json({ ok: true })
}
