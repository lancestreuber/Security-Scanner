import type { NextConfig } from "next";

// Security headers applied to every response.
// Vercel automatically adds Strict-Transport-Security for production — the
// remaining 5 headers are added here to satisfy all scanner checks.
const SECURITY_HEADERS = [
  {
    // Blocks the page from being framed (clickjacking prevention).
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    // Prevents MIME-type sniffing.
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    // Controls how much referrer info is sent with requests.
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    // Restricts browser features to only what the app needs.
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  },
  {
    // Content Security Policy.
    // Next.js App Router + Turbopack requires unsafe-inline/unsafe-eval for hydration.
    // Supabase Realtime uses wss://*.supabase.co.
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://openrouter.ai",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Apply to all routes
        source: '/(.*)',
        headers: SECURITY_HEADERS,
      },
    ]
  },
}

export default nextConfig;
