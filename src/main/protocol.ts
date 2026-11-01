import { net, protocol, type Session } from 'electron'
import { join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { INTERNAL_PAGES } from '@shared/types'

export const SCHEME = 'ovyra'

/** Hosts served from the renderer bundle: the browser UI itself plus the internal pages. */
const HOSTS = new Set<string>(['shell', 'overlay', ...INTERNAL_PAGES])

export function registerSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, codeCache: true }
    }
  ])
}

export function isInternalUrl(url: string): boolean {
  return url.startsWith(`${SCHEME}://`)
}

export function serveRendererBundle(ses: Session): void {
  const rendererDir = join(__dirname, '../renderer')
  const devServer = process.env.ELECTRON_RENDERER_URL

  ses.protocol.handle(SCHEME, (req) => {
    const url = new URL(req.url)
    if (!HOSTS.has(url.host)) return new Response('Not found', { status: 404 })
    const path = decodeURIComponent(url.pathname)

    if (devServer) return net.fetch(new URL(path, devServer).toString())

    const file = normalize(join(rendererDir, path === '/' ? 'index.html' : path))
    if (!file.startsWith(rendererDir + sep)) return new Response('Forbidden', { status: 403 })
    return net.fetch(pathToFileURL(file).toString())
  })
}
