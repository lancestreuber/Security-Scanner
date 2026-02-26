import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const DEV = process.env.NODE_ENV === 'development'

// GET — list the current user's scheduled scans
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('scheduled_scans')
    .select('id, site_id, frequency, next_run_at, last_run_at, sites!site_id(url, display_name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: 'Failed to fetch schedules' }, { status: 500 })

  return NextResponse.json({ schedules: data })
}

// POST — create a scheduled scan (Max plan only)
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Parse body
  let body: { site_id?: string; frequency?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { site_id, frequency } = body

  if (!site_id || typeof site_id !== 'string') {
    return NextResponse.json({ error: 'site_id is required' }, { status: 400 })
  }
  if (frequency !== 'weekly' && frequency !== 'monthly') {
    return NextResponse.json({ error: 'frequency must be "weekly" or "monthly"' }, { status: 400 })
  }

  // Verify user is on Max plan — always check server-side
  const { data: profileRaw } = await supabase
    .from('profiles')
    .select('plan_id')
    .eq('id', user.id)
    .single()

  if ((profileRaw as { plan_id: string } | null)?.plan_id !== 'max') {
    return NextResponse.json(
      { error: 'Scheduled scans require the Max plan.' },
      { status: 403 }
    )
  }

  // Verify site belongs to this user
  const { data: site } = await supabase
    .from('sites')
    .select('id')
    .eq('id', site_id)
    .eq('user_id', user.id)
    .single()

  if (!site) {
    return NextResponse.json({ error: 'Site not found or access denied' }, { status: 404 })
  }

  // Compute next_run_at: weekly = +7 days, monthly = +30 days
  const next = new Date()
  if (frequency === 'weekly') {
    next.setDate(next.getDate() + 7)
  } else {
    next.setDate(next.getDate() + 30)
  }

  const serviceClient = await createClient(true)
  const { data: schedule, error: insertError } = await serviceClient
    .from('scheduled_scans')
    .insert({
      user_id: user.id,
      site_id,
      frequency,
      next_run_at: next.toISOString(),
    })
    .select('id')
    .single()

  if (insertError) {
    if (DEV) console.error('[api/scheduled-scans] insert error:', insertError)
    // Unique constraint violation = schedule already exists for this site
    if (insertError.code === '23505') {
      return NextResponse.json(
        { error: 'A schedule already exists for this site. Remove it first to change frequency.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: 'Failed to create schedule' }, { status: 500 })
  }

  if (DEV) console.log('[api/scheduled-scans] created', { scheduleId: schedule?.id, site_id, frequency })

  return NextResponse.json({ ok: true, id: schedule?.id }, { status: 201 })
}

// DELETE — remove a scheduled scan
export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.id || typeof body.id !== 'string') {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  // RLS on scheduled_scans ensures users can only delete their own rows,
  // but we use service role for consistency with other write operations.
  // Verify ownership explicitly before deleting.
  const { data: existing } = await supabase
    .from('scheduled_scans')
    .select('id')
    .eq('id', body.id)
    .eq('user_id', user.id)
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'Schedule not found or access denied' }, { status: 404 })
  }

  const serviceClient = await createClient(true)
  const { error } = await serviceClient
    .from('scheduled_scans')
    .delete()
    .eq('id', body.id)

  if (error) {
    if (DEV) console.error('[api/scheduled-scans] delete error:', error)
    return NextResponse.json({ error: 'Failed to delete schedule' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
