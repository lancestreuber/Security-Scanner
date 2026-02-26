'use client'

import { useState } from 'react'

export default function EmailCapture() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error' | 'duplicate'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || status === 'loading') return
    setStatus('loading')
    setErrorMsg('')

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })

      if (res.ok) {
        setStatus('success')
        setEmail('')
        return
      }

      const body = await res.json().catch(() => ({}))
      if (res.status === 409) {
        setStatus('duplicate')
      } else {
        setStatus('error')
        setErrorMsg(body.error ?? 'Something went wrong. Try again.')
      }
    } catch {
      setStatus('error')
      setErrorMsg('Network error. Check your connection and try again.')
    }
  }

  if (status === 'success') {
    return (
      <div
        className="flex items-center gap-3 px-5 py-3.5 rounded-lg"
        style={{
          background: 'rgba(0, 255, 148, 0.08)',
          border: '1px solid rgba(0, 255, 148, 0.25)',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path
            d="M3 9.5L7 13.5L15 4.5"
            stroke="#00ff94"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span style={{ color: '#00ff94', fontFamily: 'var(--font-dm-sans)', fontSize: '0.875rem' }}>
          You&apos;re on the list. I&apos;ll reach out soon.
        </span>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          disabled={status === 'loading'}
          className="flex-1 px-4 py-2.5 rounded-lg text-sm outline-none transition-colors duration-150"
          style={{
            background: 'var(--m-surface)',
            border: '1px solid var(--m-border)',
            color: 'var(--m-text)',
            fontFamily: 'var(--font-dm-sans)',
          }}
          onFocus={(e) =>
            ((e.currentTarget as HTMLInputElement).style.borderColor =
              'rgba(0, 255, 148, 0.35)')
          }
          onBlur={(e) =>
            ((e.currentTarget as HTMLInputElement).style.borderColor = 'var(--m-border)')
          }
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="btn-primary px-5 py-2.5 rounded-lg text-sm shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {status === 'loading' ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              Sending
            </span>
          ) : (
            'Notify Me'
          )}
        </button>
      </form>

      {status === 'duplicate' && (
        <p
          className="mt-2 text-xs"
          style={{ color: 'var(--m-muted)', fontFamily: 'var(--font-dm-sans)' }}
        >
          You&apos;re already on the list.
        </p>
      )}

      {status === 'error' && (
        <p
          className="mt-2 text-xs"
          style={{ color: '#ff6b6b', fontFamily: 'var(--font-dm-sans)' }}
        >
          {errorMsg}
        </p>
      )}
    </div>
  )
}
