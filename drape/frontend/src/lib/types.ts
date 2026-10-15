export type Category = 'top' | 'bottom' | 'layer' | 'dress' | 'shoes' | 'accessory'
export type Slot = 'layer' | 'top' | 'dress' | 'bottom' | 'shoes' | 'accessory'
export type Status = 'active' | 'for_sale' | 'donate' | 'keepsake' | 'archived'

export interface Garment {
  id: string
  name: string
  category: Category
  subtype: string | null
  color_name: string | null
  color_hex: string | null
  pattern: 'solid' | 'patterned'
  formality: number
  warmth: number
  seasons: string[]
  status: Status
  price: number | null
  purchased_on: string | null
  image_url: string | null
  thumb_url: string | null
  cutout_ok: boolean
  needs_review: boolean
  wear_count: number
  last_worn: string | null
  cost_per_wear: number | null
  versatility?: number
  created_at: string | null
}

export interface Fiber { fiber: string; percent: number | null }
export interface Care { wash?: string; dry?: string; iron?: string; dry_clean?: boolean }

export interface GarmentDetail extends Garment {
  fiber_content: Fiber[]
  care: Care
  care_advice: string | null
  wear_history: { id: string; worn_on: string; source: string; outfit_id: string | null; occasion: string | null }[]
  saved_outfit_count: number
  nudge: { due: boolean; idle_days: number; threshold: number; never_worn: boolean }
  resale_links: { label: string; url: string }[]
}

export interface Draft {
  id: string
  status: 'ready' | 'duplicate' | 'error'
  filename?: string
  error?: string
  image_url?: string
  thumb_url?: string
  name?: string
  category?: Category
  subtype?: string
  category_confidence?: number
  color_name?: string
  color_hex?: string
  pattern?: 'solid' | 'patterned'
  fiber_guess?: string | null
  formality?: number
  warmth?: number
  seasons?: string[]
  cutout_ok?: boolean
  needs_review?: boolean
  tips?: string[]
  near_duplicate?: { id: string; name: string } | null
}

export interface Piece { slot: Slot; garment_id: string; garment?: Garment | null }

export interface SuggestedOutfit {
  pieces: Piece[]
  score: number
  reasons: string[]
}

export interface SavedOutfit {
  id: string
  name: string | null
  occasion: string | null
  source: string
  saved: boolean
  worn_on: string | null
  reasons: string[]
  created_at: string | null
  pieces: Piece[]
  status?: 'confirmed' | 'needs_review' | null
  photo?: { id: string; status: string } | null
}

export interface Profile {
  id: string
  email: string | null
  display_name: string | null
  is_admin: boolean
  is_demo: boolean
  demo_expires_at: string | null
  units: 'c' | 'f'
  nudge_days: number
  notify_in_app: boolean
  notify_email: boolean
  study_opt_in: boolean
  keep_original_photos: boolean
  chat_photos_opt_in: boolean
  storage_bytes: number
  storage_quota_bytes: number
  email_available: boolean
}

export interface AppConfig {
  supabase_url: string | null
  supabase_anon_key: string | null
  dev_login: boolean
  demo_mode: boolean
  study_mode: boolean
  feature_color_profile: boolean
  llm_provider: string
}
