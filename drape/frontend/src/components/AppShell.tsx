import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useMe } from '@/lib/queries'
import { BellIcon, ClosetIcon, HistoryIcon, HomeIcon, ReviewIcon } from './icons'

const TABS = [
  { to: '/', label: 'Home', icon: HomeIcon, end: true },
  { to: '/closet', label: 'Closet', icon: ClosetIcon, end: false },
  { to: '/review', label: 'Review', icon: ReviewIcon, end: false },
  { to: '/history', label: 'History', icon: HistoryIcon, end: false },
]

function useUnread() {
  return useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api.get<{ unread: number }>('/api/notifications/unread').catch(() => ({ unread: 0 })),
    refetchInterval: 60_000,
  })
}

function AvatarMenu() {
  const { data: me } = useMe()
  const { signOut, config } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  const initial = (me?.display_name || me?.email || 'D').charAt(0).toUpperCase()
  const item = 'block w-full px-4 py-2.5 text-left text-[15px] text-ink hover:bg-surface'
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-accent font-medium text-white"
      >
        {initial}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 z-40 w-60 overflow-hidden rounded-card border border-line bg-bg py-1 shadow-lg">
          <div className="border-b border-line px-4 py-2.5 text-[13px] text-ink2">{me?.is_demo ? 'Demo account' : me?.email}</div>
          {[
            ['/settings', 'Account and settings'],
            ['/settings/colors', 'Color preferences'],
            ['/ask', 'Ask about your wardrobe'],
            ['/compare', 'Compare outfits'],
            ['/notifications', 'Notifications'],
            ...(config?.study_mode ? [['/study', 'Study participation']] : []),
            ...(me?.is_admin ? [['/admin', 'Study admin']] : []),
          ].map(([to, label]) => (
            <Link key={to} role="menuitem" to={to} className={item} onClick={() => setOpen(false)}>
              {label}
            </Link>
          ))}
          <button
            role="menuitem"
            type="button"
            className={`${item} border-t border-line`}
            onClick={async () => {
              setOpen(false)
              await signOut()
              qc.clear()
              navigate('/signin')
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

export function AppShell() {
  const { data: unread } = useUnread()
  const { data: me } = useMe()
  const location = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])
  const count = unread?.unread ?? 0
  return (
    <div className="min-h-screen pb-24 md:pb-10">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-btn focus:bg-primary focus:px-4 focus:py-2 focus:text-white">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link to="/" className="font-serif text-[26px] leading-none tracking-tight text-ink" aria-label="Drape home">
            Drape
          </Link>
          <nav aria-label="Main" className="hidden md:block">
            <ul className="flex gap-1">
              {TABS.map((t) => (
                <li key={t.to}>
                  <NavLink
                    to={t.to}
                    end={t.end}
                    className={({ isActive }) =>
                      `inline-flex min-h-[44px] items-center rounded-btn px-4 text-[15px] ${isActive ? 'bg-surface font-medium text-ink' : 'text-ink2 hover:text-ink'}`
                    }
                  >
                    {t.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/notifications" className="relative flex h-10 w-10 items-center justify-center rounded-full text-ink2 hover:bg-surface hover:text-ink" aria-label={count ? `Notifications, ${count} unread` : 'Notifications'}>
              <BellIcon />
              {count > 0 && <span className="absolute right-1 top-1 min-w-[18px] rounded-full bg-primary px-1 text-center text-[11px] leading-[18px] text-white">{count}</span>}
            </Link>
            <AvatarMenu />
          </div>
        </div>
        {me?.is_demo && (
          <div className="border-t border-line bg-surface px-4 py-1.5 text-center text-[13px] text-ink2">
            You are in a demo with fictional clothes. It is deleted after 24 hours.
          </div>
        )}
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 pt-6 md:pt-10">
        <Outlet />
      </main>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <ul className="grid grid-cols-4">
          {TABS.map((t) => (
            <li key={t.to}>
              <NavLink
                to={t.to}
                end={t.end}
                className={({ isActive }) => `flex min-h-[58px] flex-col items-center justify-center gap-0.5 text-[12px] ${isActive ? 'font-medium text-primary' : 'text-ink2'}`}
              >
                {({ isActive }) => (
                  <>
                    <t.icon strokeWidth={isActive ? 2 : 1.6} />
                    <span>{t.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
