import type { ReactNode } from 'react'

/** Tiny renderer for the consent text: headings, quotes, paragraphs and **bold**. No HTML is injected. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
  )
}

export function Markdown({ source }: { source: string }) {
  const blocks = source.trim().split(/\n\s*\n/)
  return (
    <div className="space-y-3 text-[15px] leading-relaxed">
      {blocks.map((b, i) => {
        if (b.startsWith('# ')) return <h2 key={i} className="section-title">{inline(b.slice(2))}</h2>
        if (b.startsWith('> ')) return <p key={i} className="rounded-card border border-warn/50 bg-raised p-3 text-warn">{inline(b.replace(/^> /gm, ''))}</p>
        return <p key={i}>{inline(b)}</p>
      })}
    </div>
  )
}
