# SiteScan — Project Notes

## What We Are Building
A web application where authenticated users can submit a website URL to have AI-powered security agents probe it for vulnerabilities. The app performs passive and semi-active security checks, then generates a comprehensive remediation report. This tool is private — shared only with trusted users, no public launch.

## Core User Flow
1. User logs in or signs up
2. User submits a URL from their dashboard
3. Consent modal appears — user must confirm they own the site before scan triggers
4. Scan is created in the database and a Supabase Edge Function is invoked
5. Edge Function runs checks sequentially, updating the scan row as each check completes
6. Frontend listens via Supabase Realtime and updates the UI live as results come in
7. When scan completes, user sees a full security report with a remediation guide

## Tech Stack
- **Frontend/API routes:** Next.js (App Router) deployed on Vercel free tier
- **Database + Auth + Realtime + Edge Functions:** Supabase free tier
- **AI:** Anthropic Claude API (two calls per scan)
- **Language:** TypeScript throughout

## Constraints
- Vercel free tier: serverless functions have a 10s timeout — keep API routes thin and fast
- Supabase free tier: Edge Functions handle all long-running work, Realtime must be enabled per-table in the dashboard
- Two Claude API calls per scan maximum — one for recon/planning, one for interpretation/remediation
- All probe response bodies truncated to 500 characters before storing — we never store actual leaked data

## Database Schema

### profiles
```sql
id          uuid references auth.users primary key
email       text not null
created_at  timestamptz default now()
```

### sites
```sql
id            uuid primary key default gen_random_uuid()
user_id       uuid references profiles(id) on delete cascade
url           text not null
display_name  text
last_scan_id  uuid
created_at    timestamptz default now()

constraint unique_user_url unique(user_id, url)
```

### scans
```sql
id              uuid primary key default gen_random_uuid()
site_id         uuid references sites(id) on delete cascade
user_id         uuid references profiles(id)
status          text default 'queued'
consent_given   boolean not null default false
consent_at      timestamptz
agent_plan      jsonb
check_ssl       jsonb
check_headers   jsonb
check_redirects jsonb
check_credentials jsonb
check_api_probe jsonb
overall_score   integer
report_summary  text
remediation     jsonb
error_message   text
created_at      timestamptz default now()
completed_at    timestamptz
```

### audit_log
```sql
id          uuid primary key default gen_random_uuid()
user_id     uuid references profiles(id)
scan_id     uuid references scans(id)
event       text
metadata    jsonb
created_at  timestamptz default now()
```

### Circular FK note
sites.last_scan_id references scans.id, but scans.site_id references sites.id.
Resolve by creating both tables first without the last_scan_id FK, then adding it via ALTER TABLE after both exist.

## RLS Policies (Row Level Security)
Every table must have RLS enabled. Users may only read and write their own rows.
- profiles: user can select/update where id = auth.uid()
- sites: user can select/insert/update/delete where user_id = auth.uid()
- scans: user can select/insert where user_id = auth.uid(). Edge Function uses service role key to update scans — service role bypasses RLS.
- audit_log: users can select where user_id = auth.uid(). Only service role can insert.

## Auto-Profile Trigger
When a new user signs up via Supabase Auth, a database trigger must automatically insert a row into profiles using the new user's id and email. This means the app never manually inserts into profiles.

## The 7 Build Phases
We are building this application in 7 strict phases. Do not begin any phase until Brad explicitly says the current phase is working and approved.

- **Phase 1** — Foundation: Supabase schema, RLS, auth trigger, Next.js app with login/signup/protected dashboard
- **Phase 2** — Scan submission: URL input form, consent modal, /api/scans route, sites upsert, scan row creation, rate limiting
- **Phase 3** — Realtime scaffolding: /scan/[id] page, Supabase Realtime subscription, check card UI components with all states, fake data
- **Phase 4** — Edge Function scaffold: Full execution skeleton with stubbed/fake check results flowing through the real invocation chain
- **Phase 5** — Non-AI checks: Real SSL, HTTP headers, and redirect checks inside the Edge Function
- **Phase 6** — Claude integration: Both Claude API calls, credential scanning, API probe agent, interpretation and remediation report
- **Phase 7** — UI polish: Report display, remediation guide formatting, scan history, rough edge cleanup

## Key Architectural Decisions
- All check results stored as jsonb columns on a single scans row — one Realtime subscription covers everything
- Realtime subscription unsubscribes immediately when scan status reaches 'complete' or 'failed'
- Safety timeout on Realtime subscription: unsubscribe after 3 minutes regardless
- Probe list capped at 10 requests max in code, regardless of what Claude returns
- Rate limit: 5 scans per user per 24 hours, enforced in the API route
- Consent is recorded in the database AND verified by the Edge Function before any probing begins
- JS file fetching uses Promise.allSettled with a 3-second per-request timeout
- Both Claude responses parsed with try/catch — one retry with stricter prompt on failure, then mark scan failed with clear error

## Environment Variables Needed
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENROUTER_API_KEY
```

## Session Notes

### Completed Phases
- **Phase 1** ✅ — Schema, RLS, auth trigger, login/signup, protected dashboard
- **Phase 2** ✅ — URL form, consent modal, /api/scans, site upsert, rate limit, scan row
- **Phase 3** ✅ — Scan page with polling-based live updates, check cards, types
- **Phase 4** ✅ — Edge Function scaffold (stubbed), full invocation chain wired end-to-end
- **Phase 5** ✅ — Real SSL certificate, HTTP security headers, and HTTPS redirect checks
- **Phase 6** ✅ — Claude recon plan (Call 1), credential file scan, API endpoint probing, Claude remediation report (Call 2)

### Critical Pattern: PostgREST FK Hint (DO NOT REMOVE)
The schema has a circular FK between `scans` and `sites` (scans.site_id→sites AND sites.last_scan_id→scans). PostgREST sees two possible join paths and errors with "ambiguous relationship" unless you use the FK hint syntax. **Always use this in every query that joins scans to sites:**
```typescript
.select('..., sites!site_id(url, display_name)')  // ✅ correct
.select('..., sites(url, display_name)')           // ❌ will break silently
```
Also: Supabase TypeScript inference breaks on `!hint` syntax and returns `GenericStringError`. Fix: cast the query result to a typed `RawScan` interface.

### Supabase Realtime Setup (Required for Phase 3)
Two steps required for Realtime to work:

**1. Enable the Realtime toggle on the table:**
Go to **Database → Tables → scans** and toggle Realtime to ON.
(Note: "Database → Replication" in the current Supabase dashboard shows PostgreSQL replication info but does NOT have the per-table Realtime toggle — that has moved to the table settings.)

**2. Set REPLICA IDENTITY FULL (critical):**
Run this once in the Supabase SQL Editor:
```sql
ALTER TABLE scans REPLICA IDENTITY FULL;
```
Without this, Postgres only includes the PK + changed columns in WAL UPDATE events. Supabase Realtime can silently drop filtered `postgres_changes` events when the identity is insufficient. `FULL` includes all columns in every UPDATE event.

The Realtime subscription in `scan-realtime.tsx` subscribes to `postgres_changes` UPDATE events on `scans` filtered by scan ID.

### Phase 3 Fake-Data Verification SQL
Run this in Supabase SQL Editor to populate a scan with fake results and observe Realtime firing. Replace `'your-scan-id-here'` with a real scan ID from your database:
```sql
UPDATE scans SET
  status = 'running',
  agent_plan = '{"observations": ["Site uses HTTPS", "nginx server detected", "Found robots.txt and sitemap.xml"], "probe_targets": [{"url": "/api/v1/users", "method": "GET", "purpose": "Check for unauthenticated user listing"}]}'::jsonb,
  check_ssl = '{"status": "passed", "summary": "Certificate valid, 287 days remaining", "issuer": "Let''s Encrypt", "days_remaining": 287}'::jsonb,
  check_headers = '{"status": "warning", "summary": "3 security headers missing", "findings": [{"header": "Content-Security-Policy", "status": "missing"}, {"header": "Permissions-Policy", "status": "missing"}, {"header": "X-Content-Type-Options", "status": "missing"}]}'::jsonb,
  check_redirects = '{"status": "passed", "summary": "HTTP redirects to HTTPS correctly"}'::jsonb,
  check_credentials = '{"status": "passed", "summary": "No exposed credentials detected"}'::jsonb,
  check_api_probe = '{"status": "failed", "summary": "2 endpoints returned unexpected data", "findings": [{"endpoint": "/api/v1/users", "issue": "Returns user list without authentication"}]}'::jsonb
WHERE id = 'your-scan-id-here';

-- Then mark complete:
UPDATE scans SET
  status = 'complete',
  overall_score = 62,
  report_summary = 'The site has a valid SSL certificate and correct redirect behavior, but is missing critical HTTP security headers and has an unauthenticated API endpoint that exposes user data.',
  completed_at = now()
WHERE id = 'your-scan-id-here';
```

### Phase 3 File Structure
```
app/scan/[id]/
  page.tsx          — Server component: auth check, service-role fetch, passes ScanData to client
  scan-realtime.tsx — Client component: 3s polling loop, state management, renders full scan UI
  check-card.tsx    — Pure display component: all 6 check card states (queued/running/passed/warning/failed/error)
  types.ts          — Shared TypeScript types: CheckStatus, CheckResult, AgentPlan, ScanData, SiteData
```

Note: Uses polling (setInterval 3s) instead of Supabase Realtime postgres_changes. Realtime was unreliable due to async auth initialization race in @supabase/supabase-js v2.97+. Phase 4+ will use Edge Function → Supabase Broadcast instead.

### Phase 4 Edge Function

**File:** `supabase/functions/run-scan/index.ts`

Deno-based Edge Function invoked by `/api/scans` (fire-and-forget) after a scan row is created. Uses the service role key (auto-available as `SUPABASE_SERVICE_ROLE_KEY` in Supabase's runtime).

**Invocation chain:**
1. `/api/scans` POST creates scan row (status: queued)
2. `serviceClient.functions.invoke('run-scan', { body: { scanId } })` — non-blocking
3. Edge Function: verifies scan → sets running → runs checks with delays → sets complete

**Phase 4 stub timing** (total ~14s):
- running + agent_plan: immediate
- check_ssl: +2s
- check_headers: +3s
- check_redirects: +2s
- check_credentials: +3s
- check_api_probe: +4s
- complete: immediate after last check

**CRITICAL: New Supabase key format requires `--no-verify-jwt`**

Supabase's new key format (`sb_secret_...`) is **not a JWT**. The Edge Functions runtime validates the `Authorization` header as a JWT by default and silently rejects the new keys with `{"code":401,"message":"Invalid JWT"}` — the function never runs and no logs appear.

Fix: `supabase/config.toml` has `verify_jwt = false`. Always deploy with `--no-verify-jwt`:

```bash
npx supabase functions deploy run-scan --project-ref <your-project-ref> --no-verify-jwt
```

This is safe — the function validates consent and scan status in the DB using the service role key. The function endpoint is not guessable and all business logic is validated internally.

No additional secrets needed for Phases 4–5. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by Supabase. For Phase 6, set: `npx supabase secrets set OPENROUTER_API_KEY=sk-or-...`

### Phase 5 Non-AI Checks

**File:** `supabase/functions/run-scan/index.ts` (replaces Phase 4 stubs)

Three real network checks replace the Phase 4 stubs. Credentials and API probe remain as "passed" stubs until Phase 6.

**SSL check — `Deno.connectTls`:**
- Opens a raw TLS connection to port 443 using `Deno.connectTls({ hostname, port: 443 })`
- Calls `.handshake()` to get `peerCertificate` (issuer, validTo)
- Reports passed/warning/failed based on days remaining (< 0 = failed, < 14 = warning)
- Falls back gracefully if `peerCertificate` is null (some Deno Deploy versions)

**Headers check — `fetch` with `method: 'HEAD'`:**
- Fetches the target URL with HEAD (no body download)
- Checks for 6 headers: `Strict-Transport-Security`, `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`
- Any missing `high`-severity header → `failed`; only `medium`/`low` missing → `warning`

**Redirect check — manual redirect following:**
- Starts from `http://hostname` and follows redirects manually (`redirect: 'manual'`)
- Reports the full redirect chain in the `chain` array
- `failed` if final URL is not HTTPS; `warning` if chain has > 4 hops; `passed` otherwise
- Special case: HTTP port not responding → `warning` (site may be HTTPS-only but missing HTTP redirect)

**Parallelism:**
All three real checks run in parallel via `Promise.all`. Each check updates the DB via `.then()` as soon as it completes — the polling UI gets incremental updates as each check finishes, while total wall time is bounded by the slowest check (not the sum).

**Scoring (Phase 5):**
- 5 checks × 20 pts max = 100
- Credentials and API probe: 20 pts each (optimistic stub)
- Real checks: passed=20, warning=12, failed=0, error=5
- Phase 6 will recalculate including real credential and API probe results

**Timeout values:**
- TLS connect: 10s
- HEAD fetch: 10s
- Each redirect hop: 8s (max 8 hops)

### Phase 6 Claude Integration

**File:** `supabase/functions/run-scan/index.ts` (Phase 6 rewrite)

Two Claude API calls per scan via OpenRouter (`anthropic/claude-haiku-4-5`). Both use 25s timeout, JSON-mode prompting, one retry with stricter message on failure, and a static fallback if both attempts fail.

**Required secret (set before deploying Phase 6):**
```bash
npx supabase secrets set OPENROUTER_API_KEY=sk-or-... --project-ref <ref>
```

**Execution flow:**
1. Mark `status = running`
2. **Claude Call 1** — recon plan: infers tech stack from hostname, returns `observations[]` + `probe_targets[]` (capped to 10). Immediately writes to `agent_plan` column.
3. **All 5 checks run in parallel** via `Promise.all`, each writing its result to the DB as it completes (incremental UI updates):
   - SSL, headers, redirects (same as Phase 5)
   - Credential scan (new)
   - API endpoint probe (new, uses Claude's `probe_targets`)
4. **Claude Call 2** — remediation: reads all 5 results, returns `score` (0-100), `summary` (2-3 sentences), `remediation` (critical/high/medium/low buckets).
5. Mark `status = complete` with all final fields.

**Credential scan (`checkCredentials`):**
- Fetches 10 standard paths: `/.env`, `/.env.local`, `/.env.production`, `/.git/config`, `/wp-config.php`, `/config/database.yml`, `/.htpasswd`, `/phpinfo.php`, `/config.json`, `/.npmrc`
- Skips HTML responses (SPA frameworks return `index.html` for missing routes)
- Checks 10 secret patterns: AWS key, GitHub token, Stripe key, private key header, database URL, API key, secret token, password field, bearer token, JWT secret
- High severity: pattern matched in file content
- Medium severity: known-sensitive file accessible as non-HTML even without pattern match
- Stores `findings[]` (path + type + severity) and `probed_paths[]` — never stores file content

**API endpoint probe (`checkApiProbe`):**
- Uses `probe_targets` from Claude's recon plan (capped to 10 per NOTES constraint)
- 8s timeout per endpoint via `Promise.allSettled`
- Flags: 200-299 on probed endpoint (high if JSON, medium otherwise), 5xx errors (medium)
- Ignores 401/403/404 (expected/protected behavior)
- Stores `findings[]` (endpoint, method, status_code, issue, severity, purpose) and `probed[]` list
- Response bodies truncated to 500 chars and not stored

**Scoring:** Claude generates a 0-100 score using the deduction rubric in the prompt. Falls back to static scoring (5 checks × 20pts) if both Claude calls fail.

**New UI elements:**
- Credential card modal: shows exposed files list (path + type + severity pill) + all probed paths with ✓/✗ indicators
- API probe card modal: shows findings (method badge + endpoint + HTTP status + issue + severity) + all probed endpoints with ✓/✗
- Remediation guide section: appears below report summary when scan completes. Buckets: Critical (red), High (orange), Medium (yellow), Low (blue). Each item: issue title + fix instructions.

**New types (`app/scan/[id]/types.ts`):**
```typescript
export type RemediationItem = { issue: string; fix: string }
export type Remediation = { critical?: RemediationItem[]; high?: RemediationItem[]; medium?: RemediationItem[]; low?: RemediationItem[] }
```
`ScanData` now includes `remediation: Remediation | null`.
