'use client';
import { useEffect, useRef, useState } from 'react';

type Hit = { id: number; label: string; sub: string };

export function RefPicker({ name, kind, initialId, initialLabel, invalid, id }: { name: string; kind: string; initialId?: number | null; initialLabel?: string | null; invalid?: boolean; id?: string }) {
  const [sel, setSel] = useState<{ id: number; label: string } | null>(initialId ? { id: initialId, label: initialLabel ?? `#${initialId}` } : null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    const t = setTimeout(() => fetch(`/api/ops/lookup?kind=${kind}&q=${encodeURIComponent(q)}`, { signal: ctl.signal }).then((r) => (r.ok ? r.json() : [])).then(setHits).catch(() => {}), 150);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, open, kind]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div className="picker" ref={box}>
      <input type="hidden" name={name} value={sel?.id ?? ''} />
      {sel ? (
        <div className="row" style={{ justifyContent: 'space-between', border: '1px solid var(--line-2)', borderRadius: 10, padding: '8px 12px', background: '#fff', minHeight: 42 }}>
          <span>{sel.label}</span>
          <button type="button" className="btn sm ghost" onClick={() => { setSel(null); setQ(''); }} aria-label={`Clear ${name}`}>Clear</button>
        </div>
      ) : (
        <input id={id ?? name} className="input" placeholder="Search…" value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} aria-invalid={invalid} autoComplete="off" role="combobox" aria-expanded={open} aria-controls={`${name}-list`} />
      )}
      {open && !sel && (
        <div className="picker-list" id={`${name}-list`} role="listbox">
          {hits.length === 0 && <div className="empty">{q ? 'No matches' : 'Type to search'}</div>}
          {hits.map((h) => <button type="button" key={h.id} role="option" aria-selected={false} onClick={() => { setSel({ id: h.id, label: h.label }); setOpen(false); }}>{h.label}{h.sub && <span className="tiny muted"> · {h.sub}</span>}</button>)}
        </div>
      )}
    </div>
  );
}
