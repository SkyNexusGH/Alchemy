import { Notification } from 'electron'

/**
 * Data for the new tab page widgets. Everything here is fetched only when a widget that
 * needs it is turned on, and nothing identifies the user: weather goes by the city they
 * typed, news by the feeds they picked.
 */

// ---- weather (Open-Meteo: free, no account) ------------------------------------------

export interface Place {
  name: string
  country: string
  lat: number
  lon: number
}

export async function findPlaces(query: string): Promise<Place[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=5&language=en&format=json&name=${encodeURIComponent(q)}`)
  const data = (await res.json()) as { results?: { name: string; country?: string; admin1?: string; latitude: number; longitude: number }[] }
  return (data.results ?? []).map((r) => ({
    name: r.name,
    country: [r.admin1, r.country].filter(Boolean).join(', '),
    lat: r.latitude,
    lon: r.longitude
  }))
}

export interface Weather {
  temp: number
  high: number
  low: number
  code: number
  rainLater: number
  unit: 'C' | 'F'
  /** The next 12 hours (#158). */
  hours: { time: string; temp: number; code: number; rain: number }[]
  /** The next 7 days. */
  days: { date: string; high: number; low: number; code: number; rain: number }[]
  /** A heads-up for storms, strong wind, heavy rain or snow today or tomorrow (#159). */
  alert: string | null
}

const weatherCache = new Map<string, { at: number; data: Weather }>()

export async function weather(lat: number, lon: number, unit: 'C' | 'F'): Promise<Weather | null> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)},${unit}`
  const hit = weatherCache.get(key)
  // Weather doesn't change by the minute; one fetch per 15 minutes is plenty.
  if (hit && Date.now() - hit.at < 15 * 60_000) return hit.data
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,weather_code&hourly=temperature_2m,weather_code,precipitation_probability` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,wind_gusts_10m_max,precipitation_sum,snowfall_sum` +
      `&forecast_days=7&timezone=auto${unit === 'F' ? '&temperature_unit=fahrenheit' : ''}`
    const d = (await (await fetch(url)).json()) as {
      current: { temperature_2m: number; weather_code: number; time: string }
      hourly: { time: string[]; temperature_2m: number[]; weather_code: number[]; precipitation_probability: number[] }
      daily: {
        time: string[]
        temperature_2m_max: number[]
        temperature_2m_min: number[]
        precipitation_probability_max: number[]
        weather_code: number[]
        wind_gusts_10m_max: number[]
        precipitation_sum: number[]
        snowfall_sum: number[]
      }
    }
    const nowHour = d.hourly.time.findIndex((t) => t >= d.current.time.slice(0, 13))
    const from = nowHour === -1 ? 0 : nowHour
    const hours = d.hourly.time.slice(from + 1, from + 13).map((time, i) => ({
      time,
      temp: Math.round(d.hourly.temperature_2m[from + 1 + i]),
      code: d.hourly.weather_code[from + 1 + i],
      rain: d.hourly.precipitation_probability[from + 1 + i] ?? 0
    }))
    const days = d.daily.time.map((date, i) => ({
      date,
      high: Math.round(d.daily.temperature_2m_max[i]),
      low: Math.round(d.daily.temperature_2m_min[i]),
      code: d.daily.weather_code[i],
      rain: d.daily.precipitation_probability_max[i] ?? 0
    }))
    const data: Weather = {
      temp: Math.round(d.current.temperature_2m),
      code: d.current.weather_code,
      high: Math.round(d.daily.temperature_2m_max[0]),
      low: Math.round(d.daily.temperature_2m_min[0]),
      rainLater: d.daily.precipitation_probability_max[0] ?? 0,
      unit,
      hours,
      days,
      alert: weatherAlert(d.daily)
    }
    weatherCache.set(key, { at: Date.now(), data })
    return data
  } catch {
    return hit?.data ?? null
  }
}

/**
 * A heads-up worked out from the forecast (Open-Meteo has no official warnings): thunderstorms,
 * strong gusts, heavy rain or heavy snow today or tomorrow.
 */
function weatherAlert(daily: { weather_code: number[]; wind_gusts_10m_max: number[]; precipitation_sum: number[]; snowfall_sum: number[] }): string | null {
  for (const [i, when] of [[0, 'today'], [1, 'tomorrow']] as const) {
    const code = daily.weather_code[i]
    if (code >= 95) return `Thunderstorms likely ${when}`
    if ((daily.wind_gusts_10m_max[i] ?? 0) >= 70) return `Strong wind ${when}: gusts up to ${Math.round(daily.wind_gusts_10m_max[i])} km/h`
    if ((daily.snowfall_sum[i] ?? 0) >= 5) return `Heavy snow ${when}: about ${Math.round(daily.snowfall_sum[i])} cm`
    if ((daily.precipitation_sum[i] ?? 0) >= 20) return `Heavy rain ${when}: about ${Math.round(daily.precipitation_sum[i])} mm`
    if (code === 66 || code === 67) return `Freezing rain ${when}`
  }
  return null
}

// ---- news (RSS / Atom feeds the user picked) -------------------------------------------

export interface NewsItem {
  title: string
  link: string
  source: string
  image: string | null
  date: number
}

const newsCache = new Map<string, { at: number; items: NewsItem[] }>()

const decode = (s: string): string =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .trim()

const tag = (xml: string, name: string): string | null => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? decode(m[1]) : null
}

async function readFeed(url: string): Promise<NewsItem[]> {
  const hit = newsCache.get(url)
  if (hit && Date.now() - hit.at < 20 * 60_000) return hit.items
  const xml = await (await fetch(url, { headers: { 'User-Agent': 'Alchemy browser news widget' } })).text()
  const source = tag(xml.split(/<(item|entry)[\s>]/i)[0], 'title') ?? new URL(url).hostname.replace(/^www\./, '')
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/(item|entry)>/gi) ?? []
  const items = blocks.slice(0, 8).flatMap((b) => {
    const title = tag(b, 'title')
    const link = tag(b, 'link') || b.match(/<link[^>]*href="([^"]+)"/i)?.[1] || ''
    if (!title || !/^https?:/.test(link)) return []
    const image =
      b.match(/<media:(?:content|thumbnail)[^>]*url="([^"]+)"/i)?.[1] ?? b.match(/<enclosure[^>]*url="([^"]+\.(?:jpe?g|png|webp)[^"]*)"/i)?.[1] ?? null
    const when = tag(b, 'pubDate') ?? tag(b, 'updated') ?? tag(b, 'published')
    return [{ title, link, source, image, date: when ? Date.parse(when) || 0 : 0 }]
  })
  newsCache.set(url, { at: Date.now(), items })
  return items
}

/** The newest headlines across the user's feeds, newest first. Feeds that fail are skipped. */
export async function news(feeds: string[]): Promise<NewsItem[]> {
  const all = await Promise.all(feeds.slice(0, 8).map((f) => readFeed(f).catch(() => [] as NewsItem[])))
  // Take turns between feeds so one busy site doesn't fill the whole row.
  const out: NewsItem[] = []
  for (let i = 0; i < 8; i++) for (const list of all) if (list[i]) out.push(list[i])
  return out.slice(0, 12)
}

// ---- focus timer (shared by every new tab page) ---------------------------------------

let focus: { endsAt: number; minutes: number } | null = null
let focusTimer: NodeJS.Timeout | null = null

export function focusState(): { endsAt: number; minutes: number } | null {
  return focus
}

export function startFocus(minutes: number): void {
  focus = { endsAt: Date.now() + minutes * 60_000, minutes }
  if (focusTimer) clearTimeout(focusTimer)
  focusTimer = setTimeout(() => {
    focus = null
    if (Notification.isSupported()) new Notification({ title: 'Focus session done', body: `${minutes} minutes. Time for a break.` }).show()
  }, minutes * 60_000)
}

export function stopFocus(): void {
  focus = null
  if (focusTimer) clearTimeout(focusTimer)
  focusTimer = null
}
