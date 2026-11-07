import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { TabAudio, TabState } from '@shared/types'
import { prettyUrl } from '@shared/url'
import { api } from '../lib/api'
import { Moon, Volume2, VolumeX } from '../lib/icons'
import { Favicon } from '../lib/ui'

type Info = TabState & { memoryMB: number | null }

const memory = (mb: number): string => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`)

/** The card shown when hovering a tab: what it is, what it costs, and its volume boost. */
export function TabCard({ tabId }: { tabId: number }): React.JSX.Element | null {
  const [info, setInfo] = useState<Info | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const card = useRef<HTMLDivElement>(null)
  const fit = (): void => {
    if (card.current) void api.invoke('overlay:resize', card.current.offsetHeight + 28)
  }

  useEffect(() => {
    setPreview(null)
    void api.invoke<string | null>('tab:preview', tabId).then(setPreview)
  }, [tabId])

  useEffect(() => {
    const load = (): void => void api.invoke<Info | null>('tab:info', tabId).then(setInfo)
    load()
    const id = setInterval(load, 1000)
    return () => clearInterval(id)
  }, [tabId])

  useLayoutEffect(fit)

  if (!info) return null
  const url = prettyUrl(info.displayUrl)
  const showBoost = !info.sleeping && (info.audible || info.boost > 1 || info.bass || info.mono || info.spatial)
  const setAudio = (patch: Partial<TabAudio>): void => {
    setInfo({ ...info, ...patch, ...(patch.mono ? { spatial: false } : {}), ...(patch.spatial ? { mono: false } : {}) })
    void api.invoke('tab:audio', tabId, patch)
  }
  const setBoost = (v: number): void => setAudio({ boost: v })

  return (
    <div
      className="panel tab-card"
      ref={card}
      onPointerEnter={() => void api.invoke('tabcard:hover', true)}
      onPointerLeave={() => void api.invoke('tabcard:hover', false)}
    >
      {preview && !info.sleeping && <img className="tc-preview" src={preview} alt="" onLoad={fit} />}
      <div className="tc-head">
        <Favicon src={info.favicon} url={info.displayUrl} size={18} />
        <div className="tc-title">{info.title}</div>
      </div>
      {url && <div className="tc-url">{url}</div>}
      <div className="tc-meta">
        {info.sleeping ? (
          <span>
            <Moon size={12} /> Sleeping · using no memory
          </span>
        ) : (
          info.memoryMB !== null && <span>Memory {memory(info.memoryMB)}</span>
        )}
        {info.audible && !info.muted && <span className="tc-playing">Playing</span>}
      </div>
      {showBoost && (
        <div className="tc-boost">
          <button
            className="tc-mute"
            title={info.muted ? 'Unmute tab' : 'Mute tab'}
            onClick={() => void api.invoke('tab:mute', tabId)}
          >
            {info.muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          <input
            type="range"
            min={100}
            max={400}
            step={25}
            value={Math.round(info.boost * 100)}
            style={{ '--fill': `${((info.boost * 100 - 100) / 300) * 100}%` } as React.CSSProperties}
            onChange={(e) => setBoost(Number(e.target.value) / 100)}
            title="Volume boost"
          />
          <span className={`tc-boost-value${info.boost > 1 ? ' on' : ''}`}>{Math.round(info.boost * 100)}%</span>
        </div>
      )}
      {showBoost && (
        <div className="tc-fx" role="group" aria-label="Sound effects">
          <button className={info.bass ? 'on' : ''} title="More low end" onClick={() => setAudio({ bass: !info.bass })}>
            Bass
          </button>
          <button className={info.spatial ? 'on' : ''} title="A wider stereo sound" onClick={() => setAudio({ spatial: !info.spatial })}>
            Spatial
          </button>
          <button className={info.mono ? 'on' : ''} title="The same sound in both ears, for one earbud" onClick={() => setAudio({ mono: !info.mono })}>
            Mono
          </button>
        </div>
      )}
    </div>
  )
}

/** The card shown when hovering a bookmark: a picture of the page (when it's open in a tab), its name and address. */
export function BookmarkCard({ url, title, favicon, panelId }: { url: string; title: string; favicon: string | null; panelId?: string }): React.JSX.Element {
  const [preview, setPreview] = useState<string | null>(null)
  const card = useRef<HTMLDivElement>(null)
  const fit = (): void => {
    if (card.current) void api.invoke('overlay:resize', card.current.offsetHeight + 28)
  }
  useEffect(() => {
    // Sidebar sites have their own pictures (taken when last closed).
    void api.invoke<string | null>(panelId ? 'panel:preview' : 'bookmark:preview', panelId ?? url).then(setPreview)
  }, [url, panelId])
  useLayoutEffect(fit)
  return (
    <div className="panel tab-card" ref={card}>
      {preview && <img className="tc-preview" src={preview} alt="" onLoad={fit} />}
      <div className="tc-head">
        <Favicon src={favicon} url={url} size={18} />
        <div className="tc-title">{title || prettyUrl(url)}</div>
      </div>
      <div className="tc-url">{prettyUrl(url)}</div>
    </div>
  )
}

/** Ctrl+Tab: your tabs, most recently used first, as pictures. Let go of Ctrl to switch. */
export function Switcher({
  items,
  index
}: {
  items: { id: number; title: string; favicon: string | null; url: string }[]
  index: number
}): React.JSX.Element {
  const [pics, setPics] = useState<Record<number, string | null>>({})
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    for (const it of items) {
      if (it.id in pics) continue
      void api.invoke<string | null>('tab:preview', it.id).then((p) => setPics((cur) => ({ ...cur, [it.id]: p })))
    }
  }, [items])
  useEffect(() => {
    list.current?.children[index]?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [index])
  return (
    <div className="switcher" ref={list}>
      {items.map((it, i) => (
        <button key={it.id} className={`sw-card${i === index ? ' on' : ''}`} onClick={() => void api.invoke('switcher:pick', it.id)}>
          <span className="sw-pic">
            {pics[it.id] ? <img src={pics[it.id]!} alt="" /> : <Favicon src={it.favicon} url={it.url} size={34} />}
          </span>
          <span className="sw-title">
            <Favicon src={it.favicon} url={it.url} size={14} />
            <span>{it.title || prettyUrl(it.url)}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
