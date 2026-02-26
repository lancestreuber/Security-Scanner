'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

function isValidUrl(input: string): boolean {
  try {
    const url = new URL(input)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function normalizeUrl(input: string): string {
  const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`
  return withProtocol.replace(/\/$/, '')
}

export default function ScanForm({
  scansUsedToday,
  dailyLimit,
}: {
  scansUsedToday: number
  dailyLimit: number | null  // null = unlimited (Max tier)
}) {
  const router = useRouter()
  const [rawUrl, setRawUrl] = useState('')
  const [confirmedUrl, setConfirmedUrl] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [consentChecked, setConsentChecked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)

  const remaining = dailyLimit === null ? Infinity : dailyLimit - scansUsedToday
  const isLimited = dailyLimit !== null && remaining <= 0

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    const url = normalizeUrl(rawUrl.trim())

    if (!rawUrl.trim()) {
      setFormError('Please enter a URL.')
      return
    }

    if (!isValidUrl(url)) {
      setFormError('Please enter a valid URL (e.g. https://example.com)')
      return
    }

    if (isLimited) {
      setFormError(
        `Rate limit reached. Your plan allows ${dailyLimit} scan${dailyLimit !== 1 ? 's' : ''} per 24 hours.`
      )
      return
    }

    setConfirmedUrl(url)
    setConsentChecked(false)
    setModalError(null)
    setShowModal(true)
  }

  function handleCancel() {
    setShowModal(false)
    setModalError(null)
  }

  async function handleConfirm() {
    if (!consentChecked || loading) return
    setLoading(true)
    setModalError(null)

    try {
      const res = await fetch('/api/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: confirmedUrl }),
      })

      const data = await res.json()

      if (!res.ok) {
        setModalError(data.error ?? 'Failed to start scan. Please try again.')
        setLoading(false)
        return
      }

      router.push(`/scan/${data.scanId}`)
    } catch {
      setModalError('Network error. Please try again.')
      setLoading(false)
    }
  }

  return (
    <>
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
        <h2 className="text-base font-medium text-white mb-1">New scan</h2>
        <p className="text-sm text-gray-500 mb-4">
          Enter the URL of a site you own or have permission to test.
        </p>

        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="text"
            value={rawUrl}
            onChange={(e) => setRawUrl(e.target.value)}
            placeholder="https://example.com"
            className="flex-1 rounded-md bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={isLimited}
            className="rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 text-sm font-medium text-white transition-colors whitespace-nowrap"
          >
            Scan site
          </button>
        </form>

        {formError && (
          <p className="mt-2 text-sm text-red-400">{formError}</p>
        )}

        <p className="mt-3 text-xs text-gray-600">
          {dailyLimit === null
            ? 'Unlimited scans today'
            : `${Math.max(0, remaining)} of ${dailyLimit} scan${dailyLimit !== 1 ? 's' : ''} remaining today`}
        </p>
      </div>

      {/* Consent modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-lg bg-gray-900 border border-gray-700 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-1">Confirm ownership</h2>
            <p className="text-sm text-gray-400 mb-4">
              You are about to run a security scan on:
            </p>

            <div className="rounded-md bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-indigo-300 font-mono mb-5 break-all">
              {confirmedUrl}
            </div>

            <label className="flex items-start gap-3 cursor-pointer mb-5">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-600 bg-gray-700 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-gray-900"
              />
              <span className="text-sm text-gray-300 leading-relaxed">
                I confirm that I own this website or have explicit written permission
                to run security tests against it. I understand that this tool will
                make HTTP requests to the target URL.
              </span>
            </label>

            {modalError && (
              <p className="mb-4 text-sm text-red-400 bg-red-950 border border-red-800 rounded-md px-3 py-2">
                {modalError}
              </p>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                disabled={loading}
                className="flex-1 rounded-md border border-gray-600 px-4 py-2 text-sm text-gray-300 hover:text-white hover:border-gray-500 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={!consentChecked || loading}
                className="flex-1 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 text-sm font-medium text-white transition-colors"
              >
                {loading ? 'Starting…' : 'Start scan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
