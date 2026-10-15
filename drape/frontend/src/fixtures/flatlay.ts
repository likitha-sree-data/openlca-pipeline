import type { Garment, Piece } from '@/lib/types'

function g(id: string, name: string, category: Garment['category'], slug: string): Garment {
  return {
    id, name, category, subtype: null, color_name: null, color_hex: null, pattern: 'solid', formality: 2, warmth: 2,
    seasons: [], status: 'active', price: null, purchased_on: null, image_url: `/demo-garments/${slug}.svg`,
    thumb_url: `/demo-garments/${slug}.svg`, cutout_ok: true, needs_review: false, wear_count: 0, last_worn: null,
    cost_per_wear: null, created_at: null,
  }
}

export const FIXTURE_GARMENTS = {
  shirt: g('f1', 'Cream cotton shirt', 'top', 'cream-cotton-shirt'),
  jeans: g('f2', 'Navy straight jeans', 'bottom', 'navy-straight-jeans'),
  cardigan: g('f3', 'Olive cardigan', 'layer', 'olive-cardigan'),
  trainers: g('f5', 'White trainers', 'shoes', 'white-trainers'),
  dress: g('f10', 'Green midi dress', 'dress', 'green-midi-dress'),
  loafers: g('f8', 'Brown loafers', 'shoes', 'brown-loafers'),
}

export const FOUR_PIECES: Piece[] = [
  { slot: 'top', garment_id: 'f1', garment: FIXTURE_GARMENTS.shirt },
  { slot: 'layer', garment_id: 'f3', garment: FIXTURE_GARMENTS.cardigan },
  { slot: 'bottom', garment_id: 'f2', garment: FIXTURE_GARMENTS.jeans },
  { slot: 'shoes', garment_id: 'f5', garment: FIXTURE_GARMENTS.trainers },
]

export const DRESS_PIECES: Piece[] = [
  { slot: 'dress', garment_id: 'f10', garment: FIXTURE_GARMENTS.dress },
  { slot: 'shoes', garment_id: 'f8', garment: FIXTURE_GARMENTS.loafers },
]
