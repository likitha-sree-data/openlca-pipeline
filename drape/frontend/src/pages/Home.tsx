import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Garment, Piece, SuggestedOutfit } from '@/lib/types'
import { OCCASIONS, WEEKDAYS, formatTemp, isoDate, occasionLabel, parseIso, useMe } from '@/lib/queries'
import { cachedWeather, clearWeather, fetchWeather, type Weather } from '@/lib/weather'
import { useToast } from '@/lib/toast'
import { ChipGroup, ConfirmDialog, EmptyState, ErrorNote, Loading, PageHeader } from '@/components/ui'
import { FlatLay, GarmentImage } from '@/components/garment'
import { MiniOutfit, PieceList, PlanDialog, Reasons, SLOT_LABEL, outfitKey, piecesIn } from '@/components/outfit'
import { ShuffleIcon } from '@/components/icons'

type Occasion = (typeof OCCASIONS)[number]['id']

interface SuggestResponse {
  outfit: SuggestedOutfit | null
  more: SuggestedOutfit[]
  missing: string[]
  note?: string
}
interface PlanItem { id: string; plan_date: string; occasion: string; outfit: { pieces: Piece[] } | null }
interface Versatility {
  total_outfits: number
  ranked: { garment: Garment; outfits: number }[]
  capsule: { size: number; outfits: number; garments: Garment[] }
}

const MISSING_TEXT: Record<string, string> = { top: 'a top', bottom: 'a bottom', shoes: 'a pair of shoes' }

export default function Home() {
  const [params, setParams] = useSearchParams()
  const pinned = params.get('pin')
  const [occasion, setOccasion] = useState<Occasion>((params.get('occasion') as Occasion) || 'everyday')
  const [weather, setWeather] = useState<Weather | null>(cachedWeather)
  const [weatherError, setWeatherError] = useState<string | null>(null)
  const [seed, setSeed] = useState(0)
  const [exclude, setExclude] = useState<string[][]>([])
  const [current, setCurrent] = useState<SuggestedOutfit | null>(null)
  const [activeSlot, setActiveSlot] = useState<Piece['slot'] | null>(null)
  const [confirmWear, setConfirmWear] = useState(false)
  const [plan, setPlan] = useState<{ open: boolean; date?: string }>({ open: false })
  const { data: me } = useMe()
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const temp = weather?.temp_c ?? null

  const suggest = useQuery({
    queryKey: ['suggest', occasion, temp, seed, pinned, exclude.length],
    queryFn: () => api.post<SuggestResponse>('/api/outfits/suggest', { occasion, temp_c: temp, seed, pinned, exclude }),
  })
  useEffect(() => {
    if (suggest.data) {
      setCurrent(suggest.data.outfit)
      setActiveSlot(null)
    }
  }, [suggest.data])

  const key = outfitKey(current)
  const more = useQuery({
    queryKey: ['more', key, occasion, temp],
    queryFn: () => api.post<{ outfits: SuggestedOutfit[] }>('/api/outfits/more', { pieces: piecesIn(current!), occasion, temp_c: temp }),
    enabled: Boolean(current) && key !== outfitKey(suggest.data?.outfit),
  })
  const moreOutfits = key === outfitKey(suggest.data?.outfit) ? suggest.data?.more ?? [] : more.data?.outfits ?? []

  const alts = useQuery({
    queryKey: ['alts', key, activeSlot, occasion, temp],
    queryFn: () =>
      api.post<{ options: { garment_id: string; outfit: SuggestedOutfit }[] }>('/api/outfits/alternatives', {
        pieces: piecesIn(current!),
        slot: activeSlot,
        occasion,
        temp_c: temp,
      }),
    enabled: Boolean(current && activeSlot),
  })

  const plans = useQuery({ queryKey: ['plans'], queryFn: () => api.get<PlanItem[]>('/api/plans?days=7') })
  const vers = useQuery({ queryKey: ['versatility'], queryFn: () => api.get<Versatility>('/api/versatility?capsule_size=8') })

  const save = useMutation({
    mutationFn: () => api.post('/api/outfits', { pieces: piecesIn(current!), occasion, reasons: current!.reasons, source: 'generated' }),
    onSuccess: () => {
      toast('Look saved')
      qc.invalidateQueries({ queryKey: ['looks'] })
    },
  })
  const wear = useMutation({
    mutationFn: () => api.post('/api/outfits/wear', { pieces: piecesIn(current!), occasion, confirmed: true }),
    onSuccess: () => {
      setConfirmWear(false)
      toast('Recorded as worn today')
      qc.invalidateQueries({ queryKey: ['garments'] })
      qc.invalidateQueries({ queryKey: ['history'] })
      qc.invalidateQueries({ queryKey: ['suggest'] })
    },
  })
  const savePlan = useMutation({
    mutationFn: ({ date, occ }: { date: string; occ: string }) => api.put('/api/plans', { plan_date: date, occasion: occ, pieces: piecesIn(current!) }),
    onSuccess: (_d, v) => {
      setPlan({ open: false })
      toast(`Planned for ${parseIso(v.date).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}`)
      qc.invalidateQueries({ queryKey: ['plans'] })
    },
  })

  const shuffle = () => {
    if (current) {
      void api.post('/api/outfits/dismiss', { pieces: piecesIn(current), occasion, temp_c: temp }).catch(() => {})
      setExclude((x) => [...x, current.pieces.map((p) => p.garment_id)].slice(-20))
    }
    setSeed((s) => s + 1)
  }

  const askWeather = async () => {
    setWeatherError(null)
    try {
      setWeather(await fetchWeather())
    } catch (e) {
      setWeatherError((e as Error).message)
    }
  }

  const today = new Date()
  const subtitle = (
    <>
      {today.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
      {weather && `. ${formatTemp(weather.temp_c, me?.units)} and ${weather.label}`}
    </>
  )

  const pinnedPiece = useMemo(() => current?.pieces.find((p) => p.garment_id === pinned)?.garment, [current, pinned])

  return (
    <>
      <PageHeader title="Today's outfit." subtitle={subtitle} />
      <div className="mb-6 space-y-3">
        <ChipGroup label="Occasion" options={OCCASIONS} value={occasion} onChange={(v) => { setOccasion(v); setExclude([]) }} />
        <div className="flex flex-wrap items-center gap-2 text-[15px]">
          {weather ? (
            <>
              <span className="text-ink2">Weather is on.</span>
              <button type="button" className="btn-quiet btn-sm" onClick={() => { clearWeather(); setWeather(null) }}>Turn off weather</button>
            </>
          ) : (
            <button type="button" className="btn-quiet btn-sm -ml-3" onClick={askWeather}>Use my local weather</button>
          )}
          {weatherError && <span className="text-ink2" role="status">{weatherError}</span>}
        </div>
        {pinned && (
          <div className="flex flex-wrap items-center gap-2 rounded-card border border-line px-4 py-2.5 text-[15px]">
            <span>Styling your {pinnedPiece?.name.toLowerCase() ?? 'piece'}.</span>
            <button type="button" className="btn-quiet btn-sm" onClick={() => { params.delete('pin'); setParams(params, { replace: true }) }}>Show any outfit</button>
          </div>
        )}
      </div>

      {suggest.isLoading ? (
        <Loading label="Putting an outfit together" />
      ) : suggest.error ? (
        <ErrorNote error={suggest.error} onRetry={() => suggest.refetch()} />
      ) : suggest.data?.missing.length ? (
        <EmptyState
          title="A few more pieces first."
          body={<>To suggest an outfit, Drape needs {suggest.data.missing.map((m) => MISSING_TEXT[m] ?? m).join(', ').replace(/, ([^,]*)$/, ' and $1')}{suggest.data.missing.includes('top') ? ', or a dress instead of a top and a bottom' : ''}. Add photos of what you own and come back.</>}
          action={<Link to="/closet/add" className="btn-primary">Add garment</Link>}
        />
      ) : !current ? (
        <EmptyState title="No outfit fits yet." body={suggest.data?.note} action={<Link to="/closet/add" className="btn-primary">Add garment</Link>} />
      ) : (
        <>
          <section aria-label="Suggested outfit" className="grid gap-6 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:gap-10">
            <div>
              <FlatLay pieces={current.pieces} onPieceClick={(slot) => setActiveSlot((s) => (s === slot ? null : slot))} activeSlot={activeSlot} />
              <Reasons reasons={current.reasons} />
            </div>
            <div>
              <PieceList outfit={current} activeSlot={activeSlot} onPick={(slot) => setActiveSlot((s) => (s === slot ? null : slot))} />
              {activeSlot && (
                <div className="mt-4" aria-live="polite">
                  <h3 className="mb-2 text-[15px] font-medium">Other {SLOT_LABEL[activeSlot].toLowerCase()} options</h3>
                  {alts.isLoading ? (
                    <Loading label="Finding options" />
                  ) : alts.data?.options.length ? (
                    <ul className="grid grid-cols-3 gap-2" aria-label={`Alternatives for ${SLOT_LABEL[activeSlot]}`}>
                      {alts.data.options.map((o) => {
                        const g = o.outfit.pieces.find((p) => p.slot === activeSlot)?.garment
                        if (!g) return null
                        return (
                          <li key={o.garment_id}>
                            <button type="button" className="block w-full text-left" onClick={() => { setCurrent(o.outfit); setActiveSlot(null) }} aria-label={`Use ${g.name}`}>
                              <span className="card flex aspect-square items-center justify-center p-2"><GarmentImage garment={g} /></span>
                              <span className="mt-1 block text-tile">{g.name}</span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <p className="text-[15px] text-ink2">Nothing else in your closet goes with the rest of this outfit. Add more {SLOT_LABEL[activeSlot].toLowerCase()} pieces to get options.</p>
                  )}
                </div>
              )}
              <div className="mt-6 grid grid-cols-2 gap-2">
                <button type="button" className="btn-primary col-span-2" onClick={() => save.mutate()} disabled={save.isPending}>Save this look</button>
                <button type="button" className="btn-secondary" onClick={() => setPlan({ open: true })}>Plan another day</button>
                <Link to="/settings/colors" className="btn-secondary">Choose colors</Link>
                <button type="button" className="btn-secondary" onClick={() => setConfirmWear(true)}>Wear this today</button>
                <button type="button" className="btn-secondary" onClick={shuffle}><ShuffleIcon width={18} height={18} />Show another</button>
                <button type="button" className="btn-quiet col-span-2" onClick={() => navigate('/compare', { state: { a: current, occasion } })}>Compare with another outfit</button>
              </div>
              {(save.error || wear.error) && <div className="mt-3"><ErrorNote error={save.error ?? wear.error} /></div>}
            </div>
          </section>

          <section aria-labelledby="more-title" className="mt-12">
            <h2 id="more-title" className="section-title">More outfits from these pieces.</h2>
            <p className="mt-1 text-[15px] text-ink2">Each one changes a single piece. A few clothes make many outfits.</p>
            {moreOutfits.length ? (
              <ul className="mt-4 grid grid-cols-3 gap-3 md:gap-5">
                {moreOutfits.map((o) => {
                  const changed = o.pieces.find((p) => !current.pieces.some((c) => c.garment_id === p.garment_id))?.garment?.name
                  return (
                    <li key={outfitKey(o)}>
                      <MiniOutfit outfit={o} label={changed ? `With ${changed.toLowerCase()}` : 'Without the layer'} onClick={() => setCurrent(o)} />
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="mt-3 text-[15px] text-ink2">{more.isLoading ? 'Looking for variations.' : 'No variations yet. Add a few more pieces to see them.'}</p>
            )}
          </section>
        </>
      )}

      <section aria-labelledby="plans-title" className="mt-12">
        <h2 id="plans-title" className="section-title">Planned days</h2>
        <ul tabIndex={0} aria-label="Next 7 days" className="scrollbar-none -mx-4 mt-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-7 md:px-0">
          {Array.from({ length: 7 }, (_, i) => {
            const d = new Date()
            d.setDate(d.getDate() + i)
            const iso = isoDate(d)
            const p = plans.data?.find((x) => x.plan_date === iso)
            const day = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : WEEKDAYS[d.getDay()]
            return (
              <li key={iso} className="w-[132px] shrink-0 md:w-auto">
                <div className="mb-1.5 text-[13px]">
                  <span className="font-medium">{day}</span> <span className="text-ink2">{d.getDate()}</span>
                </div>
                {p?.outfit ? (
                  <MiniOutfit outfit={p.outfit} label={occasionLabel(p.occasion)} />
                ) : (
                  <button
                    type="button"
                    className="card flex aspect-[4/5] w-full items-center justify-center border border-dashed border-line-strong text-[13px] text-ink2 hover:text-ink"
                    onClick={() => current && setPlan({ open: true, date: iso })}
                    disabled={!current}
                    aria-label={`Plan ${day}`}
                  >
                    Plan this day
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      {vers.data && vers.data.ranked.length > 0 && (
        <section aria-labelledby="vers-title" className="mt-12">
          <h2 id="vers-title" className="section-title">Pieces that work in several outfits.</h2>
          <p className="mt-1 text-[15px] text-ink2">Your closet makes {vers.data.total_outfits} outfits that pass Drape's color and dress-code rules.</p>
          <ol className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {vers.data.ranked.slice(0, 6).map((r, i) => (
              <li key={r.garment.id}>
                <Link to={`/closet/${r.garment.id}`} className="block">
                  <span className="card flex aspect-square items-center justify-center p-3"><GarmentImage garment={r.garment} /></span>
                  <span className="mt-1.5 block text-tile">{i + 1}. {r.garment.name}</span>
                  <span className="block text-[13px] text-ink2">In {r.outfits} outfits</span>
                </Link>
              </li>
            ))}
          </ol>
          {vers.data.capsule.garments.length > 0 && (
            <div className="card mt-6 p-5">
              <h3 className="font-serif text-[19px]">A small capsule.</h3>
              <p className="mt-1 text-[15px] text-ink2">
                These {vers.data.capsule.garments.length} pieces make {vers.data.capsule.outfits} outfits together.
              </p>
              <ul className="mt-4 flex flex-wrap gap-2" aria-label="Capsule pieces">
                {vers.data.capsule.garments.map((g) => (
                  <li key={g.id} className="flex h-16 w-16 items-center justify-center rounded-card bg-bg p-1.5" title={g.name}>
                    <GarmentImage garment={g} />
                    <span className="sr-only">{g.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <ConfirmDialog
        open={confirmWear}
        title="Wear this today?"
        body={<>Drape will add one wear to each piece: {current?.pieces.map((p) => p.garment?.name).join(', ')}. Only confirm if you are wearing them.</>}
        confirmLabel="Yes, I am wearing this"
        busy={wear.isPending}
        onCancel={() => setConfirmWear(false)}
        onConfirm={() => wear.mutate()}
      />
      {plan.open && (
        <PlanDialog
          open
          initialDate={plan.date}
          initialOccasion={occasion}
          busy={savePlan.isPending}
          onClose={() => setPlan({ open: false })}
          onSave={(date, occ) => savePlan.mutate({ date, occ })}
        />
      )}
    </>
  )
}
