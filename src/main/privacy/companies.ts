import { getDomain } from 'tldts-experimental'

/**
 * Which company is behind a blocked request, by its domain, for the "Who tried to track
 * you" chart. Only the big, well-known ad and tracking companies; everything else is "Other".
 */
const OWNERS: Record<string, string> = {
  'doubleclick.net': 'Google',
  'googlesyndication.com': 'Google',
  'google-analytics.com': 'Google',
  'googletagmanager.com': 'Google',
  'googletagservices.com': 'Google',
  'googleadservices.com': 'Google',
  'adservice.google.com': 'Google',
  'app-measurement.com': 'Google',
  'facebook.net': 'Meta',
  'facebook.com': 'Meta',
  'instagram.com': 'Meta',
  'amazon-adsystem.com': 'Amazon',
  'media-amazon.com': 'Amazon',
  'bing.com': 'Microsoft',
  'clarity.ms': 'Microsoft',
  'msn.com': 'Microsoft',
  'criteo.com': 'Criteo',
  'criteo.net': 'Criteo',
  'taboola.com': 'Taboola',
  'outbrain.com': 'Outbrain',
  'tiktok.com': 'TikTok',
  'tiktokcdn.com': 'TikTok',
  'ads-twitter.com': 'X',
  'twitter.com': 'X',
  'demdex.net': 'Adobe',
  'omtrdc.net': 'Adobe',
  'everesttech.net': 'Adobe',
  'adobedtm.com': 'Adobe',
  'bluekai.com': 'Oracle',
  'moatads.com': 'Oracle',
  'addthis.com': 'Oracle',
  'yahoo.com': 'Yahoo',
  'advertising.com': 'Yahoo',
  'hotjar.com': 'Hotjar',
  'quantserve.com': 'Quantcast',
  'scorecardresearch.com': 'Comscore',
  'pubmatic.com': 'PubMatic',
  'rubiconproject.com': 'Magnite',
  'adnxs.com': 'Xandr',
  'adsrvr.org': 'The Trade Desk',
  'casalemedia.com': 'Index Exchange',
  'openx.net': 'OpenX',
  'adsafeprotected.com': 'Integral Ad Science',
  'doubleverify.com': 'DoubleVerify',
  'segment.io': 'Segment',
  'segment.com': 'Segment',
  'mixpanel.com': 'Mixpanel',
  'amplitude.com': 'Amplitude',
  'nr-data.net': 'New Relic',
  'yandex.ru': 'Yandex',
  'snapchat.com': 'Snap',
  'linkedin.com': 'LinkedIn',
  'licdn.com': 'LinkedIn',
  'pinterest.com': 'Pinterest',
  'reddit.com': 'Reddit',
  'redditstatic.com': 'Reddit'
}

export function companyOf(url: string): string {
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    return 'Other'
  }
  for (const [domain, owner] of Object.entries(OWNERS)) if (host === domain || host.endsWith(`.${domain}`)) return owner
  return OWNERS[getDomain(host) ?? ''] ?? 'Other'
}
