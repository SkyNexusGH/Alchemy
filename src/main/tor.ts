import { app, session, type Session } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import type { TorStatus } from '@shared/types'
import { broadcast } from './broadcast'
import { setupBrowsingSession } from './sessions'
import { getSettings } from './settings'

/**
 * Alchemy Tor: windows whose traffic goes through the Tor network, using the Tor Expert
 * Bundle shipped with the installer (scripts/fetch-tor.mjs). Tor starts when the first
 * Alchemy Tor window opens and stops when the last one closes. Where Tor is blocked (or
 * "Always use bridges" is on), it connects through Snowflake bridges instead.
 */

/** Where the bundle lives: inside the installed app, or build-tor/ during development. */
function bundleDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'tor') : join(app.getAppPath(), 'build-tor')
}
const torExe = (): string => join(bundleDir(), 'tor', 'tor.exe')

export function torAvailable(): boolean {
  return existsSync(torExe())
}

const status: TorStatus = { state: 'off', progress: 0, message: '', bridges: false }
let proc: ChildProcess | null = null
let port = 0
let torSession: Session | null = null
let fallbackTimer: NodeJS.Timeout | null = null

export function torStatus(): TorStatus {
  return { ...status, available: torAvailable() }
}

function update(patch: Partial<TorStatus>): void {
  Object.assign(status, patch)
  broadcast('tor', torStatus())
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.once('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const p = (srv.address() as { port: number }).port
      srv.close(() => resolve(p))
    })
  })
}

/** The Snowflake bridge lines and transport plugin from the bundle's pt_config.json. */
function bridgeConfig(): string[] {
  const ptDir = join(bundleDir(), 'tor', 'pluggable_transports')
  const config = JSON.parse(readFileSync(join(ptDir, 'pt_config.json'), 'utf8')) as {
    pluggableTransports?: Record<string, string>
    bridges?: Record<string, string[]>
  }
  const plugin = Object.values(config.pluggableTransports ?? {}).find((line) => /\bsnowflake\b/.test(line))
  const bridges = config.bridges?.snowflake ?? []
  if (!plugin || !bridges.length) throw new Error('This Tor bundle has no Snowflake bridges')
  return [
    'UseBridges 1',
    // Relative to Tor's working folder (bundle/tor): the plugin line can't hold a path with spaces.
    plugin.replace('${pt_path}', 'pluggable_transports\\'),
    ...bridges.map((b) => `Bridge ${b}`)
  ]
}

function writeTorrc(dataDir: string, bridges: boolean): string {
  const data = join(bundleDir(), 'data')
  // Quoted, so folders with spaces in their names work.
  const q = (path: string): string => JSON.stringify(path)
  const lines = [
    `SocksPort 127.0.0.1:${port}`,
    `DataDirectory ${q(dataDir)}`,
    `GeoIPFile ${q(join(data, 'geoip'))}`,
    `GeoIPv6File ${q(join(data, 'geoip6'))}`,
    'Log notice stdout',
    'ClientOnly 1',
    'AvoidDiskWrites 1',
    ...(bridges ? bridgeConfig() : [])
  ]
  const file = join(dataDir, 'torrc')
  writeFileSync(file, lines.join('\n') + '\n')
  return file
}

function launch(bridges: boolean): void {
  // Tor's own cache (the network directory), not browsing data: it makes the next start faster.
  const dataDir = join(app.getPath('userData'), 'tor-data')
  mkdirSync(dataDir, { recursive: true })
  let torrc: string
  try {
    torrc = writeTorrc(dataDir, bridges)
  } catch (err) {
    update({ state: 'error', message: err instanceof Error ? err.message : String(err) })
    return
  }
  update({ state: 'starting', progress: 0, message: bridges ? 'Connecting through Snowflake bridges' : 'Starting Tor', bridges })
  const child = spawn(torExe(), ['-f', torrc], { windowsHide: true, cwd: join(bundleDir(), 'tor') })
  proc = child
  let buffer = ''
  child.stdout?.on('data', (chunk: Buffer) => {
    buffer += chunk.toString()
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const m = line.match(/Bootstrapped (\d+)%[^:]*: (.+)$/)
      if (!m) continue
      const progress = Number(m[1])
      update({ progress, message: m[2], ...(progress >= 100 ? { state: 'ready' } : {}) })
      if (progress >= 100 && fallbackTimer) clearTimeout(fallbackTimer)
    }
  })
  child.on('exit', (code) => {
    if (proc !== child) return
    proc = null
    if (status.state !== 'off') update({ state: 'error', message: `Tor stopped unexpectedly (code ${code ?? '?'})` })
  })

  // A network that blocks Tor never gets far. Without bridges, give it a while, then
  // switch to Snowflake on its own.
  if (fallbackTimer) clearTimeout(fallbackTimer)
  if (!bridges) {
    fallbackTimer = setTimeout(() => {
      if (status.state === 'starting' && status.progress < 50) restart(true)
    }, 35_000)
  }
}

function restart(bridges: boolean): void {
  const old = proc
  proc = null
  old?.kill()
  launch(bridges)
}

/** Starts Tor (once) and returns the session Alchemy Tor windows browse in. */
export async function startTor(): Promise<void> {
  if (proc || !torAvailable()) {
    if (!torAvailable()) update({ state: 'error', message: 'Tor isn’t included in this build of Alchemy.' })
    return
  }
  if (!port) port = await freePort()
  // The session may have been made (pointing nowhere) before the port was known.
  await getTorSession().setProxy(proxyConfig())
  launch(getSettings().torBridges)
}

export function stopTor(): void {
  if (fallbackTimer) clearTimeout(fallbackTimer)
  const old = proc
  proc = null
  old?.kill()
  update({ state: 'off', progress: 0, message: '' })
}

/** Try again, optionally switching bridges on or off (from the connecting page). */
export function retryTor(bridges?: boolean): void {
  restart(bridges ?? status.bridges)
}

// Port 9 (discard) until Tor's real port is known: requests fail instead of going direct.
const proxyConfig = (): Electron.ProxyConfig => ({ proxyRules: `socks5://127.0.0.1:${port || 9}`, proxyBypassRules: '<-loopback>' })

/**
 * One in-memory session for every Alchemy Tor window. All of its traffic goes to Tor's
 * SOCKS port, names included (SOCKS5 resolves them on the Tor side), and nothing goes
 * direct, not even before Tor is ready.
 */
export function getTorSession(): Session {
  if (torSession) return torSession
  const ses = session.fromPartition('alchemy-tor', { cache: false })
  setupBrowsingSession(ses, { incognito: true })
  void ses.setProxy(proxyConfig())
  torSession = ses
  return ses
}

/** Forgets everything from Alchemy Tor windows once the last one closes. */
export async function endTorBrowsing(): Promise<void> {
  stopTor()
  const ses = torSession
  if (!ses) return
  await ses.clearStorageData()
  await ses.clearCache()
  await ses.clearAuthCache()
}

app.on('web-contents-created', (_e, wc) => {
  // WebRTC could reveal the real IP address by going around the proxy; in Tor windows
  // it may only use the proxied route. Set after the general policy (index.ts) so this wins.
  setImmediate(() => {
    if (!wc.isDestroyed() && torSession && wc.session === torSession) wc.setWebRTCIPHandlingPolicy('disable_non_proxied_udp')
  })
})
app.on('will-quit', () => proc?.kill())
