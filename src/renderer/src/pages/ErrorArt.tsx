/**
 * Small drawings for the error pages, in Alchemy's alchemy style: a sleepy potion when
 * you're offline, an empty flask when a site can't be found, a cracked shield for unsafe
 * connections, a spilled potion when a page crashed, and an hourglass for slow sites.
 */
export type ErrorArtKind = 'offline' | 'missing' | 'unsafe' | 'crashed' | 'slow'

export function ErrorArt({ kind }: { kind: ErrorArtKind }): React.JSX.Element {
  return (
    <svg className={`error-art ${kind}`} viewBox="0 0 200 140" width="200" height="140" aria-hidden>
      {/* the table */}
      <path d="M20 128h160" stroke="var(--border-2)" strokeWidth="3" strokeLinecap="round" />
      {kind === 'offline' && (
        <g>
          <path d="M84 40h32v14l18 34c6 12-2 26-16 26H82c-14 0-22-14-16-26l18-34z" fill="var(--surface-2)" stroke="var(--text-2)" strokeWidth="3" strokeLinejoin="round" />
          <path d="M70 92h60l4 8c4 8-2 14-12 14H78c-10 0-16-6-12-14z" fill="var(--accent-fg)" opacity="0.55" />
          <rect x="80" y="30" width="40" height="12" rx="4" fill="var(--text-3)" />
          {/* sleepy eyes and a "z" */}
          <path d="M86 98q5 4 10 0M104 98q5 4 10 0" stroke="var(--text)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <text x="132" y="44" fill="var(--text-3)" fontSize="16" fontWeight="700" className="art-z">z</text>
          <text x="144" y="30" fill="var(--text-3)" fontSize="12" fontWeight="700" className="art-z late">z</text>
          {/* the unplugged cord */}
          <path d="M120 120c20 0 26-10 38-10" stroke="var(--text-3)" strokeWidth="3" fill="none" strokeLinecap="round" />
          <rect x="158" y="104" width="12" height="12" rx="2" fill="var(--text-3)" />
        </g>
      )}
      {kind === 'missing' && (
        <g>
          <path d="M84 30h32v26l22 40c6 12-2 24-16 24H78c-14 0-22-12-16-24l22-40z" fill="none" stroke="var(--text-2)" strokeWidth="3" strokeLinejoin="round" />
          <text x="100" y="104" textAnchor="middle" fill="var(--accent-fg)" fontSize="40" fontWeight="800">?</text>
          <circle cx="146" cy="40" r="4" fill="var(--text-3)" className="art-float" />
          <circle cx="58" cy="56" r="3" fill="var(--text-3)" className="art-float late" />
        </g>
      )}
      {kind === 'unsafe' && (
        <g>
          <path d="M100 20l42 14v34c0 28-18 46-42 56-24-10-42-28-42-56V34z" fill="color-mix(in srgb, var(--danger) 14%, transparent)" stroke="var(--danger)" strokeWidth="3" strokeLinejoin="round" />
          <path d="M104 30l-10 30 14 10-12 34" stroke="var(--danger)" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      {kind === 'crashed' && (
        <g>
          <g transform="rotate(-70 104 96)">
            <path d="M92 52h24v14l14 28c4 9-2 18-12 18H90c-10 0-16-9-12-18l14-28z" fill="var(--surface-2)" stroke="var(--text-2)" strokeWidth="3" strokeLinejoin="round" />
          </g>
          <path d="M60 126c10-10 30-8 44-2s30 4 46 2" fill="none" stroke="var(--accent-fg)" strokeWidth="8" strokeLinecap="round" opacity="0.6" />
          <circle cx="150" cy="116" r="5" fill="var(--accent-fg)" opacity="0.6" />
        </g>
      )}
      {kind === 'slow' && (
        <g>
          <path d="M74 22h52M74 118h52M80 22c0 30 40 34 40 48s-40 18-40 48M120 22c0 30-40 34-40 48s40 18 40 48" stroke="var(--text-2)" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M88 44h24l-12 14zM86 112c4-10 24-10 28 0z" fill="var(--accent-fg)" opacity="0.7" />
          <path d="M100 62v42" stroke="var(--accent-fg)" strokeWidth="2" strokeDasharray="3 5" className="art-sand" />
        </g>
      )}
    </svg>
  )
}
