import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { api, configureApi } from './api'
import type { AppConfig } from './types'

const TOKEN_KEY = 'drape.token'

interface AuthState {
  ready: boolean
  config: AppConfig | null
  signedIn: boolean
  supabase: SupabaseClient | null
  signInWithToken: (token: string) => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null)
  const [localToken, setLocalToken] = useState<string | null>(readToken)
  const [sbToken, setSbToken] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const sbRef = useRef<SupabaseClient | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const cfg = await api.get<AppConfig>('/api/config').catch(() => null)
      if (cancelled) return
      setConfig(cfg)
      if (cfg?.supabase_url && cfg.supabase_anon_key) {
        const { createClient } = await import('@supabase/supabase-js')
        const client = createClient(cfg.supabase_url, cfg.supabase_anon_key, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        })
        sbRef.current = client
        setSupabase(client)
        const { data } = await client.auth.getSession()
        setSbToken(data.session?.access_token ?? null)
        client.auth.onAuthStateChange((_e, session) => setSbToken(session?.access_token ?? null))
      }
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const signOut = useCallback(async () => {
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* storage may be blocked */
    }
    setLocalToken(null)
    if (sbRef.current) await sbRef.current.auth.signOut()
    setSbToken(null)
  }, [])

  const signInWithToken = useCallback((token: string) => {
    try {
      localStorage.setItem(TOKEN_KEY, token)
    } catch {
      /* session-only when storage is blocked */
    }
    setLocalToken(token)
  }, [])

  const tokenRef = useRef<string | null>(null)
  tokenRef.current = localToken ?? sbToken
  useEffect(() => {
    configureApi(
      async () => tokenRef.current,
      () => {
        if (tokenRef.current) void signOut()
      },
    )
  }, [signOut])

  const value = useMemo<AuthState>(
    () => ({ ready, config, supabase, signedIn: Boolean(localToken ?? sbToken), signInWithToken, signOut }),
    [ready, config, supabase, localToken, sbToken, signInWithToken, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
