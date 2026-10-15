import { useId } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { z } from 'zod'
import { PALETTE, cap } from '@/lib/colors'
import { Field, Segmented } from './ui'

export const garmentSchema = z.object({
  name: z.string().trim().min(1, 'Give it a short name, like Navy straight jeans.').max(80, 'Keep the name under 80 characters.'),
  category: z.enum(['top', 'bottom', 'layer', 'dress', 'shoes', 'accessory']),
  color_name: z.string().min(1),
  formality: z.coerce.number().int().min(1).max(3),
  warmth: z.coerce.number().int().min(1).max(3),
  seasons: z.array(z.enum(['spring', 'summer', 'autumn', 'winter'])),
  fibers: z.string().max(200).optional().default(''),
  price: z
    .string()
    .optional()
    .default('')
    .refine((v) => !v || (/^\d+([.,]\d{1,2})?$/.test(v.trim()) && Number(v.replace(',', '.')) <= 100000), 'Enter a price like 45 or 45.50.'),
  purchased_on: z
    .string()
    .optional()
    .default('')
    .refine((v) => !v || new Date(v) <= new Date(), 'The purchase date cannot be in the future.'),
})
export type GarmentFormValues = z.infer<typeof garmentSchema>

export const CATEGORY_OPTIONS = [
  { id: 'top', label: 'Top' },
  { id: 'bottom', label: 'Bottom' },
  { id: 'layer', label: 'Layer' },
  { id: 'dress', label: 'Dress' },
  { id: 'shoes', label: 'Shoes' },
  { id: 'accessory', label: 'Accessory' },
] as const

const FORMALITY = [
  { id: 1, label: 'Casual' },
  { id: 2, label: 'Smart casual' },
  { id: 3, label: 'Formal' },
] as const
const WARMTH = [
  { id: 1, label: 'Light' },
  { id: 2, label: 'Medium' },
  { id: 3, label: 'Warm' },
] as const
const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- shared by forms that extend the garment schema
export function GarmentFields({ form, compact }: { form: UseFormReturn<any>; compact?: boolean }) {
  const id = useId()
  const { register, watch, setValue, formState } = form
  const e = formState.errors as Partial<Record<keyof GarmentFormValues, { message?: string }>>
  const seasons: GarmentFormValues['seasons'] = watch('seasons') ?? []
  return (
    <div className={`grid gap-5 ${compact ? '' : 'md:grid-cols-2'}`}>
      <div className={compact ? '' : 'md:col-span-2'}>
        <Field label="Name" htmlFor={`${id}-name`} error={e.name?.message}>
          <input id={`${id}-name`} className="input" {...register('name')} />
        </Field>
      </div>
      <Field label="Category" htmlFor={`${id}-cat`}>
        <select id={`${id}-cat`} className="input" {...register('category')}>
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Color" htmlFor={`${id}-color`}>
        <div className="flex items-center gap-2">
          <span aria-hidden className="h-8 w-8 shrink-0 rounded-full border border-line" style={{ background: PALETTE.find((p) => p.name === watch('color_name'))?.hex }} />
          <select id={`${id}-color`} className="input" {...register('color_name')}>
            {PALETTE.map((p) => (
              <option key={p.name} value={p.name}>
                {cap(p.name)}
              </option>
            ))}
          </select>
        </div>
      </Field>
      <Segmented
        label="Formality"
        name={`${id}-formality`}
        options={FORMALITY}
        value={Number(watch('formality'))}
        onChange={(v) => setValue('formality', v, { shouldDirty: true })}
      />
      <Segmented
        label="Warmth"
        name={`${id}-warmth`}
        options={WARMTH}
        value={Number(watch('warmth'))}
        onChange={(v) => setValue('warmth', v, { shouldDirty: true })}
      />
      <fieldset className={compact ? '' : 'md:col-span-2'}>
        <legend className="label">Seasons</legend>
        <div className="flex flex-wrap gap-2">
          {SEASONS.map((s) => {
            const on = seasons.includes(s)
            return (
              <label key={s} className={`chip cursor-pointer ${on ? 'chip-active' : ''}`}>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={on}
                  onChange={() =>
                    setValue('seasons', on ? seasons.filter((x) => x !== s) : [...seasons, s], { shouldDirty: true })
                  }
                />
                {cap(s)}
              </label>
            )
          })}
        </div>
      </fieldset>
      <Field label="Fiber content" htmlFor={`${id}-fibers`} hint="Optional. For example 80% wool, 20% nylon." error={e.fibers?.message}>
        <input id={`${id}-fibers`} className="input" {...register('fibers')} />
      </Field>
      <Field label="Price" htmlFor={`${id}-price`} hint="Optional. Used for cost per wear." error={e.price?.message}>
        <input id={`${id}-price`} className="input" inputMode="decimal" {...register('price')} />
      </Field>
      <Field label="Purchase date" htmlFor={`${id}-date`} hint="Optional." error={e.purchased_on?.message}>
        <input id={`${id}-date`} type="date" className="input" {...register('purchased_on')} />
      </Field>
    </div>
  )
}
