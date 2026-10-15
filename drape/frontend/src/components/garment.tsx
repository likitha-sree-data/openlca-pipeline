import type { Category, Garment, Piece, Slot } from '@/lib/types'

// Visual scale per category so a shoe and a coat both look balanced.
const SCALE: Record<Category, string> = {
  top: 'max-h-[82%] max-w-[82%]',
  layer: 'max-h-[86%] max-w-[84%]',
  bottom: 'max-h-[88%] max-w-[70%]',
  dress: 'max-h-[90%] max-w-[72%]',
  shoes: 'max-h-[52%] max-w-[86%]',
  accessory: 'max-h-[60%] max-w-[60%]',
}

type GarmentLike = Pick<Garment, 'name' | 'category' | 'cutout_ok'> & { thumb_url?: string | null; image_url?: string | null }

export function GarmentImage({ garment, large, className = '' }: { garment: GarmentLike; large?: boolean; className?: string }) {
  const src = (large ? garment.image_url : garment.thumb_url) ?? garment.image_url ?? garment.thumb_url
  if (!src) {
    return <div className={`flex h-full w-full items-center justify-center text-[13px] text-ink2 ${className}`}>No photo</div>
  }
  if (!garment.cutout_ok) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        className={`h-[86%] w-[86%] rounded-card object-cover ${className}`}
      />
    )
  }
  return <img src={src} alt="" loading="lazy" decoding="async" className={`object-contain ${SCALE[garment.category]} ${className}`} />
}

export function GarmentTile({ garment, onClick, selected, compact }: { garment: Garment; onClick?: () => void; selected?: boolean; compact?: boolean }) {
  const content = (
    <>
      <div className={`card relative flex aspect-square items-center justify-center ${compact ? 'p-2' : 'p-4'} ${selected ? 'ring-2 ring-accent' : ''}`}>
        <GarmentImage garment={garment} />
        {garment.needs_review && (
          <span className="absolute right-2.5 top-2.5 flex items-center gap-1.5 rounded-full bg-bg/90 px-2 py-0.5 text-[12px] text-warn">
            <span className="h-2 w-2 rounded-full bg-warn" aria-hidden />
            Check details
          </span>
        )}
        {garment.status !== 'active' && (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-bg/90 px-2 py-0.5 text-[12px] text-ink2">{STATUS_LABEL[garment.status]}</span>
        )}
      </div>
      <div className="mt-2 text-tile text-ink">{garment.name}</div>
    </>
  )
  if (!onClick) return <div>{content}</div>
  return (
    <button type="button" onClick={onClick} className="block w-full rounded-card text-left" aria-pressed={selected}>
      {content}
    </button>
  )
}

export const STATUS_LABEL: Record<string, string> = {
  active: 'Keep wearing',
  for_sale: 'For sale',
  donate: 'For donation',
  keepsake: 'Keepsake',
  archived: 'Archived',
}

type CellKey = 'tl' | 'tr' | 'bl' | 'br' | 'left' | 'right'

function layout(slots: Slot[]): Record<string, CellKey> {
  const has = (s: Slot) => slots.includes(s)
  if (has('dress')) {
    if (has('layer')) return { dress: 'left', layer: 'tr', shoes: 'br' }
    return { dress: 'left', shoes: 'right' }
  }
  if (has('layer')) return { top: 'tl', layer: 'tr', bottom: 'bl', shoes: 'br' }
  return { top: 'tl', bottom: 'bl', shoes: 'right' }
}

const CELL_CLASS: Record<CellKey, string> = {
  tl: 'col-start-1 row-start-1',
  tr: 'col-start-2 row-start-1',
  bl: 'col-start-1 row-start-2',
  br: 'col-start-2 row-start-2',
  left: 'col-start-1 row-span-2 row-start-1',
  right: 'col-start-2 row-span-2 row-start-1',
}

export function FlatLay({ pieces, size = 'lg', onPieceClick, activeSlot, label }: {
  pieces: Piece[]
  size?: 'lg' | 'md' | 'sm'
  onPieceClick?: (slot: Slot) => void
  activeSlot?: Slot | null
  label?: string
}) {
  const shown = pieces.filter((p) => p.slot !== 'accessory' && p.garment)
  const cells = layout(shown.map((p) => p.slot))
  const pad = size === 'lg' ? 'p-5 md:p-7 gap-3 md:gap-4' : size === 'md' ? 'p-4 gap-2.5' : 'p-2.5 gap-1.5'
  const names = shown.map((p) => p.garment!.name).join(', ')
  return (
    <div
      className={`card grid aspect-[4/5] grid-cols-2 grid-rows-2 ${pad}`}
      role={onPieceClick ? 'group' : 'img'}
      aria-label={label ?? `Outfit: ${names}`}
    >
      {shown.map((p) => {
        const g = p.garment!
        const cell = cells[p.slot] ?? 'tl'
        const inner = (
          <div className="flex h-full w-full items-center justify-center">
            <GarmentImage garment={g} className={size === 'sm' ? '' : 'drop-shadow-[0_1px_1px_rgba(31,47,41,0.08)]'} />
          </div>
        )
        if (!onPieceClick) {
          return (
            <div key={p.slot} className={`${CELL_CLASS[cell]} flex min-h-0 min-w-0 items-center justify-center`}>
              {inner}
            </div>
          )
        }
        return (
          <button
            key={p.slot}
            type="button"
            onClick={() => onPieceClick(p.slot)}
            aria-label={`Swap ${g.name}`}
            aria-pressed={activeSlot === p.slot}
            className={`${CELL_CLASS[cell]} flex min-h-0 min-w-0 items-center justify-center rounded-card transition-colors hover:bg-bg/50 ${activeSlot === p.slot ? 'bg-bg/70 ring-2 ring-accent' : ''}`}
          >
            {inner}
          </button>
        )
      })}
    </div>
  )
}
