/**
 * Turns an address from configuration into a full public origin.
 *
 *   "https://example.com" -> unchanged
 *   "example.com"         -> "https://example.com"
 *   "pulse-web-solq"      -> "https://pulse-web-solq.onrender.com"
 *
 * The last case is what a Render Blueprint passes between services (the
 * internal host name, which is also the service's public subdomain).
 */
export function normalizeAddress(value) {
  const v = String(value).trim().replace(/\/+$/, '')
  if (/^https?:\/\//.test(v)) return v
  return `https://${v.includes('.') || v.startsWith('localhost') ? v : `${v}.onrender.com`}`
}
