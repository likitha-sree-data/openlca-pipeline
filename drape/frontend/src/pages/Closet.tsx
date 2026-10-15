import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Garment } from '@/lib/types'
import { ChipGroup, EmptyState, ErrorNote, Loading, PageHeader } from '@/components/ui'
import { GarmentTile } from '@/components/garment'
import { PlusIcon, SearchIcon } from '@/components/icons'

type Filter = 'all' | 'top' | 'bottom' | 'layer' | 'shoes' | 'dress' | 'accessory'
type Sort = 'recent' | 'least_worn' | 'most_worn'

interface Listing {
  items: Garment[]
  category_counts: Record<string, number>
  total: number
}

export default function Closet() {
  const [params, setParams] = useSearchParams()
  const filter = (params.get('category') as Filter) || 'all'
  const sort = (params.get('sort') as Sort) || 'recent'
  const [q, setQ] = useState(params.get('q') ?? '')
  const navigate = useNavigate()

  const query = useQuery({
    queryKey: ['garments', filter, sort, params.get('q') ?? ''],
    queryFn: () => {
      const sp = new URLSearchParams({ sort })
      if (filter !== 'all') sp.set('category', filter)
      if (params.get('q')) sp.set('q', params.get('q')!)
      return api.get<Listing>(`/api/garments?${sp}`)
    },
    placeholderData: keepPreviousData,
  })
  const counts = query.data?.category_counts ?? {}

  const chips = useMemo(() => {
    const base: { id: Filter; label: string }[] = [
      { id: 'all', label: 'All' },
      { id: 'top', label: 'Tops' },
      { id: 'bottom', label: 'Bottoms' },
      { id: 'layer', label: 'Layers' },
      { id: 'shoes', label: 'Shoes' },
    ]
    if (counts.dress) base.push({ id: 'dress', label: 'Dresses' })
    if (counts.accessory) base.push({ id: 'accessory', label: 'Accessories' })
    return base
  }, [counts.dress, counts.accessory])

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value && value !== 'all' && !(key === 'sort' && value === 'recent')) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const total = query.data?.total ?? 0
  const items = query.data?.items ?? []
  return (
    <>
      <PageHeader
        title="My wardrobe."
        subtitle={total ? `${total} ${total === 1 ? 'piece' : 'pieces'} you own.` : undefined}
        actions={
          <Link to="/closet/add" className="btn-primary">
            <PlusIcon width={18} height={18} />
            Add garment
          </Link>
        }
      />
      {total > 0 && (
        <div className="mb-6 space-y-4">
          <ChipGroup label="Filter by category" options={chips} value={filter} onChange={(v) => update('category', v)} />
          <div className="flex flex-col gap-3 sm:flex-row">
            <form
              role="search"
              className="relative flex-1"
              onSubmit={(e) => {
                e.preventDefault()
                update('q', q.trim() || null)
              }}
            >
              <label htmlFor="closet-search" className="sr-only">
                Search by name or color
              </label>
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink2" width={18} height={18} />
              <input
                id="closet-search"
                type="search"
                className="input pl-10"
                placeholder="Search by name or color"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  if (!e.target.value) update('q', null)
                }}
              />
            </form>
            <div className="flex items-center gap-2">
              <label htmlFor="closet-sort" className="text-sm text-ink2">
                Sort
              </label>
              <select id="closet-sort" className="input w-auto" value={sort} onChange={(e) => update('sort', e.target.value)}>
                <option value="recent">Recently added</option>
                <option value="least_worn">Least worn</option>
                <option value="most_worn">Most worn</option>
              </select>
            </div>
          </div>
        </div>
      )}
      {query.isLoading ? (
        <Loading label="Loading your closet" />
      ) : query.error ? (
        <ErrorNote error={query.error} onRetry={() => query.refetch()} />
      ) : total === 0 ? (
        <EmptyState
          title="Your closet is empty."
          body="Add a photo of something you own. Lay it flat on a plain bed or floor for the cleanest cutout. You can add many photos at once."
          action={<Link to="/closet/add" className="btn-primary">Add your first garment</Link>}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="Nothing matches."
          body={params.get('q') ? `No pieces match "${params.get('q')}". Try a color like navy, or clear the search.` : 'No pieces in this category yet.'}
          action={
            <button type="button" className="btn-secondary" onClick={() => { setQ(''); setParams(new URLSearchParams(), { replace: true }) }}>
              Show everything
            </button>
          }
        />
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-5" aria-label="Garments">
          {items.map((g) => (
            <li key={g.id}>
              <GarmentTile garment={g} onClick={() => navigate(`/closet/${g.id}`)} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
