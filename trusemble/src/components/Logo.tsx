export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 26C4 13 12 5 27 4c0 14-7 23-20 23" />
      <path d="M4 26 20 10" />
      <path d="M9 21c3-.5 6-.2 8 1M13 16c3-.8 6-.6 8.5.4M16.5 12c2.2-.7 4.3-.6 6 .1" />
    </svg>
  );
}
export function Logo({ href = '/' }: { href?: string }) {
  return (
    <a href={href} className="logo" aria-label="TruSemble home">
      <LogoMark />
      <span>TruSemble</span>
    </a>
  );
}
