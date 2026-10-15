import type { SVGProps } from 'react'

const base = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }

export const HomeIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M4 11.5 12 5l8 6.5" /><path d="M6.5 10v9h11v-9" /></svg>
)
export const ClosetIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M12 7.5a1.8 1.8 0 1 1 1.8-1.8c0 1-1.8 1.4-1.8 2.6" /><path d="M12 8.3 3.5 15a1 1 0 0 0 .6 1.8h15.8a1 1 0 0 0 .6-1.8z" /></svg>
)
export const ReviewIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M3.5 12.5 11.5 4.5h7v7l-8 8z" /><circle cx="15" cy="8" r="1.3" /></svg>
)
export const HistoryIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="8" /><path d="M12 7.5V12l3 2" /></svg>
)
export const BellIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5h-14z" /><path d="M10 20h4" /></svg>
)
export const PlusIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M12 5v14M5 12h14" /></svg>
)
export const CloseIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>
)
export const ChevronLeft = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M14.5 6 8.5 12l6 6" /></svg>
)
export const SearchIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><circle cx="11" cy="11" r="6" /><path d="m20 20-4.5-4.5" /></svg>
)
export const ShuffleIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M4 7h3.5c4 0 5 10 9 10H20M4 17h3.5c1.6 0 2.7-1.6 3.6-3.6M13 9.5c.9-1.4 2-2.5 3.5-2.5H20" /><path d="m17.5 4.5 2.5 2.5-2.5 2.5M17.5 14.5l2.5 2.5-2.5 2.5" /></svg>
)
export const ChatIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M5 17.5V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8.5z" /></svg>
)
export const CameraIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}><path d="M4 8h3l1.5-2h7L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
)
