// Downloads the newest stable Tor Expert Bundle for Windows from the Tor Project, checks it
// against the Tor Project's published SHA-256 sums, and unpacks it into build-tor/, which the
// installer ships as resources/tor (see "extraResources" in package.json).
//
// Runs on GitHub's servers during a release (.github/workflows/release.yml), so Alchemy can
// offer Tor even to people whose network blocks torproject.org.
//
//   node scripts/fetch-tor.mjs [version]

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DIST = 'https://dist.torproject.org/torbrowser/'
const OUT = 'build-tor'

async function text(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return res.text()
}

/** The highest stable Tor Browser release (alphas end in a letter, like 15.0a3). */
async function latestVersion() {
  const html = await text(DIST)
  const versions = [...html.matchAll(/href="(\d+(?:\.\d+)+)\/"/g)].map((m) => m[1])
  if (!versions.length) throw new Error('No Tor releases listed at ' + DIST)
  const cmp = (a, b) => {
    const x = a.split('.').map(Number)
    const y = b.split('.').map(Number)
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0)
    return 0
  }
  return versions.sort(cmp).at(-1)
}

const version = process.argv[2] ?? (await latestVersion())
const file = `tor-expert-bundle-windows-x86_64-${version}.tar.gz`
const base = `${DIST}${version}/`
console.log(`Tor Expert Bundle ${version}`)

const sums = await text(`${base}sha256sums-signed-build.txt`).catch(() => text(`${base}sha256sums-unsigned-build.txt`))
const expected = sums
  .split('\n')
  .map((l) => l.trim().split(/\s+/))
  .find(([, name]) => name === file)?.[0]
if (!expected) throw new Error(`${file} is not in the published checksums`)

const res = await fetch(base + file)
if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`)
const data = Buffer.from(await res.arrayBuffer())
const actual = createHash('sha256').update(data).digest('hex')
if (actual !== expected) throw new Error(`Checksum mismatch for ${file}: expected ${expected}, got ${actual}`)
console.log(`Checksum OK (${(data.length / 1048576).toFixed(1)} MB)`)

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const archive = join(OUT, file)
writeFileSync(archive, data)
// Windows 10 and later, and GitHub's runners, include tar.
execFileSync('tar', ['-xzf', file], { cwd: OUT, stdio: 'inherit' })
rmSync(archive)
writeFileSync(join(OUT, 'VERSION'), version + '\n')
console.log(`Unpacked into ${OUT}/`)
