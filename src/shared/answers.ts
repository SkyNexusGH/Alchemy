// Small address bar answers worked out without loading a page.

/** "time in tokyo", "tokyo time", "what time is it in new york" → the time there. */
export function timeIn(input: string): string | null {
  const m = input
    .trim()
    .toLowerCase()
    .match(/^(?:what(?:'?s| is)? (?:the )?)?(?:current )?time(?: is it)?(?: now)? in (.+?)\??$|^(.+?) time$/)
  if (!m) return null
  const place = (m[1] ?? m[2]).trim()
  const zone = zoneFor(place)
  if (!zone) return null
  const now = new Date()
  const time = now.toLocaleTimeString([], { timeZone: zone, hour: '2-digit', minute: '2-digit' })
  const day = now.toLocaleDateString([], { timeZone: zone, weekday: 'long' })
  // The place as you typed it ("Kraków", not the zone's "Warsaw").
  const city = place.replace(/(^|\s)(\p{L})/gu, (_m, s: string, c: string) => s + c.toUpperCase())
  return `${time} in ${city} · ${day}`
}

const ALIASES: Record<string, string> = {
  'new york': 'America/New_York', nyc: 'America/New_York', 'los angeles': 'America/Los_Angeles', la: 'America/Los_Angeles',
  'san francisco': 'America/Los_Angeles', seattle: 'America/Los_Angeles', washington: 'America/New_York', boston: 'America/New_York',
  miami: 'America/New_York', dallas: 'America/Chicago', houston: 'America/Chicago', beijing: 'Asia/Shanghai', delhi: 'Asia/Kolkata',
  'new delhi': 'Asia/Kolkata', mumbai: 'Asia/Kolkata', bangalore: 'Asia/Kolkata', uk: 'Europe/London', england: 'Europe/London',
  poland: 'Europe/Warsaw', krakow: 'Europe/Warsaw', 'kraków': 'Europe/Warsaw', germany: 'Europe/Berlin', france: 'Europe/Paris',
  spain: 'Europe/Madrid', italy: 'Europe/Rome', japan: 'Asia/Tokyo', china: 'Asia/Shanghai', india: 'Asia/Kolkata',
  australia: 'Australia/Sydney', 'hong kong': 'Asia/Hong_Kong', dubai: 'Asia/Dubai', kyiv: 'Europe/Kyiv', kiev: 'Europe/Kyiv',
  ireland: 'Europe/Dublin', canada: 'America/Toronto', brazil: 'America/Sao_Paulo', 'sao paulo': 'America/Sao_Paulo', 'são paulo': 'America/Sao_Paulo'
}

function zoneFor(place: string): string | null {
  if (ALIASES[place]) return ALIASES[place]
  const want = place.replace(/\s+/g, '_')
  let zones: string[] = []
  try {
    zones = (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone')
  } catch {
    return null
  }
  return zones.find((z) => z.split('/').pop()!.toLowerCase() === want) ?? null
}

/** #127 Well-known sites people mistype. */
const POPULAR = [
  'google.com', 'youtube.com', 'facebook.com', 'amazon.com', 'amazon.co.uk', 'wikipedia.org', 'twitter.com', 'reddit.com', 'instagram.com',
  'github.com', 'netflix.com', 'twitch.tv', 'gmail.com', 'outlook.com', 'linkedin.com', 'microsoft.com', 'apple.com', 'yahoo.com',
  'bing.com', 'ebay.com', 'ebay.co.uk', 'spotify.com', 'discord.com', 'whatsapp.com', 'tiktok.com', 'pinterest.com', 'paypal.com',
  'bbc.co.uk', 'chatgpt.com', 'office.com', 'steampowered.com', 'roblox.com', 'duckduckgo.com', 'stackoverflow.com', 'allegro.pl', 'onet.pl'
]

/** The site you probably meant ("gogle.com" → "google.com"), or null. */
export function typoFix(input: string): string | null {
  const host = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0]
  if (!host.includes('.') || POPULAR.includes(host)) return null
  let best: string | null = null
  for (const site of POPULAR) {
    if (Math.abs(site.length - host.length) > 1) continue
    if (distance(host, site) === 1 && (!best || site.length === host.length)) best = site
  }
  return best
}

/** Edit distance, with a swap of two letters counting as one. */
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  return d[a.length][b.length]
}

const CURRENCY_WORDS: Record<string, string> = {
  dollar: 'USD', dollars: 'USD', $: 'USD', usd: 'USD', euro: 'EUR', euros: 'EUR', '€': 'EUR', eur: 'EUR', pound: 'GBP', pounds: 'GBP',
  '£': 'GBP', gbp: 'GBP', zloty: 'PLN', 'złoty': 'PLN', zl: 'PLN', 'zł': 'PLN', pln: 'PLN', yen: 'JPY', jpy: 'JPY', franc: 'CHF', chf: 'CHF',
  cad: 'CAD', aud: 'AUD', sek: 'SEK', nok: 'NOK', dkk: 'DKK', czk: 'CZK', huf: 'HUF', inr: 'INR', cny: 'CNY', yuan: 'CNY', try: 'TRY',
  mxn: 'MXN', brl: 'BRL', krw: 'KRW', nzd: 'NZD', sgd: 'SGD', hkd: 'HKD', zar: 'ZAR', ron: 'RON', bgn: 'BGN', isk: 'ISK', ils: 'ILS'
}

/** "20 usd in gbp", "€15 to zł" → the amount and the two currency codes. */
export function currencyQuery(input: string): { amount: number; from: string; to: string } | null {
  const m = input
    .trim()
    .toLowerCase()
    .match(/^([$€£]?)\s*([\d.,]+)\s*([a-zł$€£]*)\s+(?:to|in|into|as|=)\s+([a-zł$€£]+)$/)
  if (!m) return null
  const from = CURRENCY_WORDS[m[3] || m[1]]
  const to = CURRENCY_WORDS[m[4]]
  const amount = Number(m[2].replace(/,/g, ''))
  return from && to && from !== to && Number.isFinite(amount) ? { amount, from, to } : null
}
