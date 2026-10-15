import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Garment, Piece } from '@/lib/types'
import { useToast } from '@/lib/toast'
import { ErrorNote, Loading, PageHeader } from '@/components/ui'
import { FlatLay, GarmentImage } from '@/components/garment'
import { Reasons, piecesIn } from '@/components/outfit'

interface ChatOutfit { pieces: Piece[]; reasons: string[]; occasion: string }
interface Msg { id: string; role: 'user' | 'assistant'; content: string; outfit: ChatOutfit | null; garments: Garment[] }

const EXAMPLES = ['What can I wear to work?', 'Do I own anything green?', "What haven't I worn lately?", 'What goes with my olive cardigan?']

export default function Ask() {
  const q = useQuery({ queryKey: ['chat'], queryFn: () => api.get<Msg[]>('/api/chat') })
  const [text, setText] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const listRef = useRef<HTMLOListElement>(null)
  const qc = useQueryClient()
  const send = useMutation({
    mutationFn: (message: string) => api.post<{ reply: Msg }>('/api/chat', { message }),
    onMutate: (m) => setPending(m),
    onSettled: () => {
      setPending(null)
      qc.invalidateQueries({ queryKey: ['chat'] })
    },
  })
  const clear = useMutation({ mutationFn: () => api.del('/api/chat'), onSuccess: () => qc.invalidateQueries({ queryKey: ['chat'] }) })
  const msgs = q.data ?? []
  const lastOutfit = [...msgs].reverse().find((m) => m.outfit)?.outfit ?? null

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: 'end' })
  }, [msgs.length, pending])

  const submit = (m: string) => {
    const v = m.trim()
    if (!v || send.isPending) return
    setText('')
    send.mutate(v)
  }

  return (
    <>
      <PageHeader title="Ask about your wardrobe." subtitle="Answers come only from your own closet and wear history. Drape reads names and details, never your photos." />
      <div className="grid gap-8 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="hidden md:block md:sticky md:top-24 md:self-start">
          {lastOutfit ? (
            <>
              <FlatLay pieces={lastOutfit.pieces} />
              <Reasons reasons={lastOutfit.reasons} />
            </>
          ) : (
            <div className="card flex aspect-[4/5] items-center justify-center p-8 text-center text-[15px] text-ink2">Ask for an outfit and it appears here.</div>
          )}
        </div>
        <section aria-label="Chat" className="flex min-h-[60vh] flex-col">
          {q.isLoading ? (
            <Loading />
          ) : q.error ? (
            <ErrorNote error={q.error} onRetry={() => q.refetch()} />
          ) : (
            <ol ref={listRef} className="flex-1 space-y-4" aria-live="polite" aria-label="Conversation">
              {msgs.length === 0 && !pending && (
                <li className="card p-5 text-[15px] text-ink2">Ask a question about your clothes, or pick one of the examples below.</li>
              )}
              {msgs.map((m) => <Message key={m.id} m={m} />)}
              {pending && (
                <>
                  <li className="ml-auto max-w-[85%] rounded-card bg-primary px-4 py-2.5 text-[15px] text-white">{pending}</li>
                  <li className="text-[15px] text-ink2" role="status">Looking through your closet</li>
                </>
              )}
            </ol>
          )}
          {send.error ? <div className="mt-3"><ErrorNote error={send.error} /></div> : null}
          <div className="sticky bottom-[64px] mt-4 bg-bg pb-3 pt-2 md:bottom-0">
            <div className="scrollbar-none -mx-4 mb-2 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0" role="group" aria-label="Example questions">
              {EXAMPLES.map((e) => (
                <button key={e} type="button" className="chip shrink-0 text-[13px]" onClick={() => submit(e)} disabled={send.isPending}>{e}</button>
              ))}
            </div>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); submit(text) }}>
              <label htmlFor="ask-input" className="sr-only">Your question</label>
              <input id="ask-input" className="input" maxLength={500} placeholder="Ask about your clothes" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
              <button type="submit" className="btn-primary shrink-0" disabled={!text.trim() || send.isPending}>Send</button>
            </form>
            {msgs.length > 0 && (
              <button type="button" className="btn-quiet btn-sm mt-2 -ml-3" onClick={() => clear.mutate()}>Clear conversation</button>
            )}
          </div>
        </section>
      </div>
    </>
  )
}

function Message({ m }: { m: Msg }) {
  const toast = useToast()
  const [saved, setSaved] = useState(false)
  const save = useMutation({
    mutationFn: () => api.post('/api/outfits', { pieces: piecesIn(m.outfit!), occasion: m.outfit!.occasion, reasons: m.outfit!.reasons, source: 'chat' }),
    onSuccess: () => {
      setSaved(true)
      toast('Outfit saved')
    },
  })
  if (m.role === 'user') return <li className="ml-auto max-w-[85%] rounded-card bg-primary px-4 py-2.5 text-[15px] text-white">{m.content}</li>
  return (
    <li className="max-w-[92%] space-y-3">
      <p className="rounded-card bg-surface px-4 py-3 text-[15px]">{m.content}</p>
      {m.garments.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Pieces mentioned">
          {m.garments.map((g) => (
            <li key={g.id} className="flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-3 text-[13px]">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface p-1"><GarmentImage garment={g} /></span>
              {g.name}
            </li>
          ))}
        </ul>
      )}
      {m.outfit && m.outfit.pieces.length > 0 && (
        <div className="card p-3">
          <div className="grid grid-cols-[120px_1fr] gap-3">
            <FlatLay pieces={m.outfit.pieces} size="sm" />
            <div className="flex flex-col justify-between">
              <ul className="space-y-0.5 text-[13px]">
                {m.outfit.pieces.map((p) => <li key={p.garment_id}>{p.garment?.name}</li>)}
              </ul>
              <button type="button" className="btn-primary btn-sm self-start" onClick={() => save.mutate()} disabled={saved || save.isPending}>
                {saved ? 'Saved' : 'Save this outfit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </li>
  )
}
