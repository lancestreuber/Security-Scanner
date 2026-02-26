import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const DEV = process.env.NODE_ENV === 'development'
const RATE_WINDOW_HOURS = 24

function isValidUrl(input: string): boolean {
  try {
    const url = new URL(input)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function normalizeUrl(input: string): string {
  // Add https:// if no protocol present
  const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`
  // Strip trailing slash
  return withProtocol.replace(/\/$/, '')
}

export async function POST(request: Request) {
  const supabase = await createClient()

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse body
  let rawUrl: string
  try {
    const body = await request.json()
    rawUrl = typeof body.url === 'string' ? body.url.trim() : ''
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!rawUrl) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 })
  }

  const url = normalizeUrl(rawUrl)

  if (!isValidUrl(url)) {
    return NextResponse.json(
      { error: 'Invalid URL. Must be a valid http:// or https:// address.' },
      { status: 400 }
    )
  }

  // Look up user's plan to determine their daily scan limit.
  // Anon client is fine here — RLS policy allows users to read their own profile row.
  // FK hint (!plan_id) required because plans.id is referenced by plan_id column.
  const { data: profileRaw } = await supabase
    .from('profiles')
    .select('plan_id, plans!plan_id(scans_per_day)')
    .eq('id', user.id)
    .single()

  // Supabase TS inference breaks on !hint syntax — cast explicitly
  type RawProfile = { plan_id: string; plans: { scans_per_day: number | null } | null }
  const profile = profileRaw as RawProfile | null

  // null scans_per_day = unlimited (Max tier). Fall back to Free (2) if lookup fails.
  const dailyLimit: number | null = profile?.plans?.scans_per_day ?? 2

  // Rate limit check — skip entirely for unlimited plans
  if (dailyLimit !== null) {
    const windowStart = new Date(
      Date.now() - RATE_WINDOW_HOURS * 60 * 60 * 1000
    ).toISOString()

    const { count, error: countError } = await supabase
      .from('scans')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', windowStart)

    if (countError) {
      return NextResponse.json({ error: 'Failed to check rate limit' }, { status: 500 })
    }

    if ((count ?? 0) >= dailyLimit) {
      return NextResponse.json(
        {
          error: `Rate limit reached. Your ${profile?.plan_id ?? 'free'} plan allows ${dailyLimit} scan${dailyLimit !== 1 ? 's' : ''} per 24 hours. Try again later.`,
        },
        { status: 429 }
      )
    }
  }

  // Use service role for all writes — bypasses RLS cleanly for server-side ops
  const serviceClient = await createClient(true)

  // Upsert site row (unique per user + url)
  const hostname = new URL(url).hostname
  const { data: site, error: siteError } = await serviceClient
    .from('sites')
    .upsert(
      { user_id: user.id, url, display_name: hostname },
      { onConflict: 'user_id,url' }
    )
    .select('id')
    .single()

  if (siteError || !site) {
    console.error('Site upsert error:', siteError)
    return NextResponse.json({ error: 'Failed to create site record' }, { status: 500 })
  }

  // Create scan row — consent confirmed on the client before this call
  const { data: scan, error: scanError } = await serviceClient
    .from('scans')
    .insert({
      site_id: site.id,
      user_id: user.id,
      status: 'queued',
      consent_given: true,
      consent_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (scanError || !scan) {
    console.error('Scan insert error:', scanError)
    return NextResponse.json({ error: 'Failed to create scan' }, { status: 500 })
  }

  // Update site.last_scan_id (best-effort — non-fatal if it fails)
  await serviceClient.from('sites').update({ last_scan_id: scan.id }).eq('id', site.id)

  // Invoke Edge Function — fire and forget, don't await.
  // The API route returns { scanId } immediately; the function runs on Supabase's infrastructure.
  serviceClient.functions.invoke('run-scan', {
    body: { scanId: scan.id },
  }).catch((err: unknown) => {
    console.error('[api/scans] Edge Function invoke error:', err)
  })

  if (DEV) console.log('[api/scans] scan created', { scanId: scan.id, siteId: site.id, userId: user.id, url })

  return NextResponse.json({ scanId: scan.id }, { status: 201 })
}
