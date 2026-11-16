import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Terms' };

export default function Terms() {
  return (
    <div className="container narrow legal-body" style={{ paddingBottom: 56 }}>
      <div className="page-title"><h1>Terms</h1><p>Last updated November 2026.</p></div>
      <h2>The record is information, not advice</h2>
      <p>Records come from public sources and are marked unverified until the team checks them. Program details, deadlines and award sizes change; check each program&apos;s own page before applying. Cost estimates in the calculator are rough and are not quotes.</p>
      <h2>Absence of a record</h2>
      <p>An empty area on the map means no published record, not that no work is happening there.</p>
      <h2>Submissions</h2>
      <p>By submitting a form you confirm the information is accurate to the best of your knowledge and that we may contact you about it. Submitting does not guarantee funding, publication or an introduction.</p>
      <h2>Data use</h2>
      <p>The source ledger is free to read. Bulk or commercial use of the record, including the monthly brief, is by license; contact the team.</p>
    </div>
  );
}
