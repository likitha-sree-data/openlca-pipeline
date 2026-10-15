import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '@/lib/api'
import type { Garment } from '@/lib/types'
import { CATEGORY_LABELS, parseIso } from '@/lib/queries'
import { ErrorNote, Loading } from './ui'
import { GarmentImage } from './garment'

interface InsightsData {
  total_wears: number
  days: number
  most_worn: { garment: Garment; wears: number; wear_log_ids: string[] }[]
  never_worn: Garment[]
  not_worn_recently: Garment[]
  by_category: { category: string; wears: number }[]
  cost_per_wear: { garment: Garment; price: number; wears: number; cost_per_wear: number }[]
}
interface Log { id: string; worn_on: string; source: string }

const BAR = 'rgb(63 107 88)'
const AXIS = { fontSize: 12, fill: 'rgb(74 87 82)' }

function ChartTip({ active, payload }: { active?: boolean; payload?: { payload: { name: string; wears: number } }[] }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-btn border border-line bg-bg px-3 py-2 text-[13px] shadow-sm">
      <div className="font-medium text-ink">{p.name}</div>
      <div className="text-ink2">{p.wears} {p.wears === 1 ? 'wear' : 'wears'}</div>
    </div>
  )
}

function LogTrail({ garmentId }: { garmentId: string }) {
  const q = useQuery({ queryKey: ['logs', garmentId], queryFn: () => api.get<Log[]>(`/api/wear-logs?garment_id=${garmentId}`) })
  if (q.isLoading) return <span className="text-ink2">Loading</span>
  return (
    <ul className="mt-1 space-y-0.5 text-[13px] text-ink2">
      {q.data?.map((l) => (
        <li key={l.id}>
          {parseIso(l.worn_on).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}, {l.source === 'photo_confirmed' ? 'confirmed from a photo' : 'logged by you'}
        </li>
      ))}
    </ul>
  )
}

export function Insights() {
  const q = useQuery({ queryKey: ['insights'], queryFn: () => api.get<InsightsData>('/api/insights') })
  const [open, setOpen] = useState<string | null>(null)
  if (q.isLoading) return <Loading label="Loading insights" />
  if (q.error) return <ErrorNote error={q.error} onRetry={() => q.refetch()} />
  const d = q.data!
  if (d.total_wears === 0)
    return <p className="text-[15px] text-ink2">Insights appear once you log or confirm what you wore.</p>
  const most = d.most_worn.map((m) => ({ name: m.garment.name, wears: m.wears }))
  const cats = d.by_category.map((c) => ({ name: CATEGORY_LABELS[c.category] ?? c.category, wears: c.wears }))
  return (
    <div className="space-y-10">
      <section aria-labelledby="most-title">
        <h3 id="most-title" className="font-serif text-[19px]">Clothes you wear most</h3>
        <p className="mt-1 text-[15px] text-ink2" id="most-summary">
          {d.total_wears} confirmed wears in total. Most worn: {d.most_worn.slice(0, 3).map((m) => `${m.garment.name} (${m.wears})`).join(', ')}.
        </p>
        <div className="mt-4 h-[280px]" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={most} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }} barCategoryGap={6}>
              <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={150} tick={AXIS} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTip />} cursor={{ fill: 'rgb(218 214 207 / 0.5)' }} />
              <Bar dataKey="wears" fill={BAR} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <details className="mt-2">
          <summary className="cursor-pointer text-[15px] text-accent">Show as a table, with the wear logs behind each number</summary>
          <table className="mt-3 w-full text-left text-[15px]">
            <caption className="sr-only">Most worn clothes and their wear logs</caption>
            <thead>
              <tr className="border-b border-line text-[13px] text-ink2"><th className="py-2 font-normal">Garment</th><th className="py-2 font-normal">Wears</th></tr>
            </thead>
            <tbody>
              {d.most_worn.map((m) => (
                <tr key={m.garment.id} className="border-b border-line align-top">
                  <td className="py-2"><Link className="underline-offset-2 hover:underline" to={`/closet/${m.garment.id}`}>{m.garment.name}</Link></td>
                  <td className="py-2">
                    <button type="button" className="text-accent underline-offset-2 hover:underline" aria-expanded={open === m.garment.id} onClick={() => setOpen(open === m.garment.id ? null : m.garment.id)}>
                      {m.wears} {m.wears === 1 ? 'wear' : 'wears'}
                    </button>
                    {open === m.garment.id && <LogTrail garmentId={m.garment.id} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <section aria-labelledby="cat-title">
        <h3 id="cat-title" className="font-serif text-[19px]">Wears by category</h3>
        <p className="mt-1 text-[15px] text-ink2">{cats.map((c) => `${c.name}: ${c.wears}`).join(', ')}.</p>
        <div className="mt-4 h-[200px]" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={cats} margin={{ left: 0, right: 8, top: 4, bottom: 4 }} barCategoryGap={8}>
              <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} width={28} />
              <Tooltip content={<ChartTip />} cursor={{ fill: 'rgb(218 214 207 / 0.5)' }} />
              <Bar dataKey="wears" fill={BAR} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        <GarmentShelf title="Never worn" empty="Everything has been worn at least once." items={d.never_worn} />
        <GarmentShelf title={`Not worn in ${d.days} days`} empty={`Nothing has gone ${d.days} days without a wear.`} items={d.not_worn_recently} />
      </div>

      <section aria-labelledby="cpw-title">
        <h3 id="cpw-title" className="font-serif text-[19px]">Cost per wear</h3>
        {d.cost_per_wear.length === 0 ? (
          <p className="mt-1 text-[15px] text-ink2">Add prices to garments to see cost per wear.</p>
        ) : (
          <table className="mt-3 w-full text-left text-[15px]">
            <caption className="sr-only">Cost per wear for priced garments</caption>
            <thead>
              <tr className="border-b border-line text-[13px] text-ink2">
                <th className="py-2 font-normal">Garment</th><th className="py-2 text-right font-normal">Price</th><th className="py-2 text-right font-normal">Wears</th><th className="py-2 text-right font-normal">Per wear</th>
              </tr>
            </thead>
            <tbody>
              {d.cost_per_wear.map((c) => (
                <tr key={c.garment.id} className="border-b border-line">
                  <td className="py-2">{c.garment.name}</td>
                  <td className="py-2 text-right tabular-nums">{c.price.toFixed(2)}</td>
                  <td className="py-2 text-right tabular-nums">{c.wears}</td>
                  <td className="py-2 text-right tabular-nums">{c.cost_per_wear.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function GarmentShelf({ title, empty, items }: { title: string; empty: string; items: Garment[] }) {
  return (
    <section>
      <h3 className="font-serif text-[19px]">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-1 text-[15px] text-ink2">{empty}</p>
      ) : (
        <ul className="mt-3 grid grid-cols-4 gap-2">
          {items.slice(0, 8).map((g) => (
            <li key={g.id}>
              <Link to={`/closet/${g.id}`} className="block">
                <span className="card flex aspect-square items-center justify-center p-1.5"><GarmentImage garment={g} /></span>
                <span className="mt-1 block text-[12px] leading-tight">{g.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
