'use client';
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="notfound">
      <h1 style={{ fontSize: 40 }}>Something went wrong</h1>
      <p className="muted" style={{ margin: '12px 0 24px' }}>Please try again. If it keeps happening, tell the team.</p>
      <button className="btn primary" onClick={reset}>Try again</button>
    </div>
  );
}
