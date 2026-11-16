export function BarList({ rows, labels }: { rows: { k: string; n: number }[]; labels?: Record<string, string> }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="barlist" role="list">
      {rows.map((r) => (
        <div className="r" role="listitem" key={r.k}>
          <span style={{ textAlign: 'right' }}>{labels?.[r.k] ?? r.k}</span>
          <span className="b"><i style={{ width: `${Math.max(0.6, (r.n / max) * 100)}%` }} /></span>
          <b className="num">{r.n.toLocaleString('en-US')}</b>
        </div>
      ))}
    </div>
  );
}
