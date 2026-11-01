// Decides whether omnibox input is an address or a search. Pure, so both the main
// process and the UI (to label the top suggestion instantly) can use it.

const SCHEMES = /^(https?|file|ovyra|view-source|about|data|blob|mailto|chrome):/i
const HOST_LIKE =
  /^(localhost|(\d{1,3}\.){3}\d{1,3}|\[[0-9a-f:]+\]|([a-z0-9¡-￿-]+\.)+([a-z¡-￿]{2,}|xn--[a-z0-9]+))(:\d{1,5})?([/?#].*)?$/i

// Generic TLDs people actually type. Two-letter country codes are all accepted.
const TLDS = new Set(
  (
    'com net org edu gov mil int io ai app dev gg tv me co info biz xyz online site store tech blog news ' +
    'shop cloud page link live pro art wiki fun club design media studio agency digital network space ' +
    'world today games game social email team top icu one zone run tools works solutions services ' +
    'systems software codes inc ltd llc gmbh moe lol wtf bot chat ninja rocks guru website eu asia ' +
    'local localhost test internal lan home arpa onion'
  ).split(' ')
)

/** The URL the input refers to, or null if it should be searched for. */
export function toUrl(input: string): string | null {
  const text = input.trim()
  if (!text || /\s/.test(text)) return null
  if (HOST_LIKE.test(text)) {
    const host = text.split(/[/?#:]/)[0].toLowerCase()
    const tld = host.split('.').pop() ?? ''
    const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host.startsWith('[')
    if (host === 'localhost' || isIp) return `http://${text}`
    if (tld.length === 2 || TLDS.has(tld) || tld.startsWith('xn--')) return `https://${text}`
  }
  if (SCHEMES.test(text)) return text
  return null
}

/** "https://www.github.com/" → "github.com", for display. */
export function prettyUrl(url: string): string {
  if (!/^https?:\/\//.test(url)) return url
  try {
    const u = new URL(url)
    const host = u.host.replace(/^www\./, '')
    const rest = (u.pathname === '/' ? '' : u.pathname) + u.search + u.hash
    return host + rest
  } catch {
    return url
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return ''
  }
}
