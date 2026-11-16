import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="notfound">
      <h1 style={{ fontSize: 40 }}>We could not find that page</h1>
      <p className="muted" style={{ margin: '12px 0 24px' }}>It may have moved, or the record is not published.</p>
      <Link className="btn primary" href="/projects">Open the map</Link>
    </div>
  );
}
