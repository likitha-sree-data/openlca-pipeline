'use client';

import { useMemo, useState } from 'react';
import { estimate, SQFT_PER_ACRE, type Benchmark } from '@/lib/calculator';

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

function NumberRow({ label, hint, value, onChange, min, max, step, unit, prefix, id }: { label: string; hint: string; value: number; onChange: (n: number) => void; min: number; max: number; step: number; unit?: string; prefix?: string; id: string }) {
  return (
    <div className="slider-row">
      <div className="top">
        <label htmlFor={`${id}-n`} style={{ fontWeight: 700 }}>{label}</label>
        <span className="num-in">{prefix && <span className="muted">{prefix}</span>}
          <input id={`${id}-n`} inputMode="decimal" value={Number.isFinite(value) ? value : ''} onChange={(e) => { const n = Number(e.target.value.replace(/[^0-9.]/g, '')); onChange(Number.isFinite(n) ? n : 0); }} aria-describedby={`${id}-hint`} />
          {unit && <span className="muted">{unit}</span>}
        </span>
      </div>
      <input type="range" aria-label={`${label} slider`} min={min} max={max} step={step} value={Math.min(max, Math.max(min, value))} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="small muted" id={`${id}-hint`}>{hint}</span>
    </div>
  );
}

export default function Calculator({ benchmarks }: { benchmarks: Benchmark[] }) {
  const [homes, setHomes] = useState(300);
  const [zone, setZone] = useState(100);
  const [share, setShare] = useState(50);
  const [grant, setGrant] = useState(75000);
  const r = useMemo(() => estimate({ homes, clearZoneFt: zone, sharePct: share, grant }, benchmarks), [homes, zone, share, grant, benchmarks]);
  const href = `/request-funding?${new URLSearchParams({ amount: String(Math.round(grant)), homes: String(homes) })}`;

  if (!r) return <div className="empty">The calculator has no cost-per-acre benchmarks yet. An operator can add them under Operations, Calculator.</div>;
  const pct = (r.coverage * 100).toFixed(1);
  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--line)', padding: '14px 0 18px' }} aria-live="polite">
        <span>Average cost <b className="num" style={{ fontSize: 20 }}>{money(r.avgCost)}</b></span>
        <span>Grant covers <b className="num" style={{ fontSize: 20 }}>{pct}%</b></span>
      </div>
      <div className="calc-grid" style={{ marginTop: 24 }}>
        <section className="card" aria-labelledby="community">
          <h2 id="community">Your community</h2>
          <p className="card-sub">Type a number or drag. The estimate updates as you go.</p>
          <NumberRow id="homes" label="Homes in the area" hint="Your community's own home count." value={homes} onChange={setHomes} min={10} max={5000} step={10} unit="homes" />
          <NumberRow id="zone" label="Clear zone around each home" hint="An assumption you choose, not a legal requirement." value={zone} onChange={setZone} min={0} max={300} step={5} unit="ft" />
          <NumberRow id="share" label="Share of homes treated" hint={`${share} means ${share === 50 ? 'half' : share === 100 ? 'all' : share + ' in 100'} the homes.`} value={share} onChange={setShare} min={0} max={100} step={1} unit="%" />
          <NumberRow id="grant" label="Grant available" hint="What you have or expect to apply for." value={grant} onChange={setGrant} min={0} max={2_000_000} step={5000} prefix="$" />
        </section>
        <div>
          <section className="estimate" aria-label="Estimate">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="muted">Average cost to treat</span>
              <span className="small" style={{ color: 'var(--accent)', fontWeight: 600 }}>Rough estimate, not a quote</span>
            </div>
            <div className="big num">{money(r.avgCost)}</div>
            <p className="small muted">Range {money(r.lowCost)} to {money(r.highCost)}</p>
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 22 }}>
              <b>Share the grant covers</b><b className="num" style={{ fontSize: 22 }}>{pct}%</b>
            </div>
            <div className="meter" role="img" aria-label={`The grant covers ${pct} percent`}><i style={{ width: `${pct}%` }} /></div>
            <p className="small muted">At 100% the grant covers the whole scope at the average price.</p>
            <div className="row" style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--line)', justifyContent: 'space-between' }}>
              <p style={{ maxWidth: 250 }}>Send these numbers to the team and we look for programs, funders and crews that fit.</p>
              <a className="btn primary" href={href}>Request funding with these numbers</a>
            </div>
          </section>
          <div className="mini-stats">
            <div><div className="k">Acres to treat</div><div className="v num">{r.acresToTreat.toFixed(1)}</div></div>
            <div><div className="k">Clear zone per home</div><div className="v num">{r.acresPerHome.toFixed(3)} acres</div></div>
            <div><div className="k">Grant per home</div><div className="v num">{money(r.grantPerHome)}</div></div>
            <div><div className="k">Acres the grant buys</div><div className="v num">{r.acresGrantBuys.toFixed(1)}</div></div>
          </div>
          <details className="card" style={{ marginTop: 16 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>How this is computed <span className="muted" style={{ fontWeight: 400, display: 'block' }}>Cost per acre from {benchmarks.length} published local programs</span></summary>
            <ol className="small" style={{ marginTop: 12, paddingLeft: 18, display: 'grid', gap: 6 }}>
              <li>Each home treats a circle of the clear-zone radius: π × r² ÷ {SQFT_PER_ACRE.toLocaleString('en-US')} sq ft per acre.</li>
              <li>Acres to treat = homes × share treated × acres per home.</li>
              <li>Cost = acres × the average cost per acre ({money(r.avgCostPerAcre)}). The range uses the lowest and highest program.</li>
              <li>The grant covers the smaller of 100% and grant ÷ cost.</li>
            </ol>
            <ul className="small muted" style={{ marginTop: 10, paddingLeft: 18 }}>{benchmarks.map((b) => <li key={b.name}>{b.name}: {money(b.costPerAcre)} per acre</li>)}</ul>
          </details>
        </div>
      </div>
    </>
  );
}
