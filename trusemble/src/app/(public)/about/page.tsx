import type { Metadata } from 'next';
import Link from 'next/link';
import { BRAND } from '@/lib/constants';

export const metadata: Metadata = { title: 'About', description: BRAND.tagline };

export default function About() {
  return (
    <div className="container narrow legal-body" style={{ paddingBottom: 56 }}>
      <div className="page-title"><h1>About TruSemble</h1><p>{BRAND.tagline} {BRAND.byline}</p></div>
      <h2>What it is</h2>
      <p>One sourced record of US wildfire mitigation: the projects, the money that paid for them, and the high-risk places nobody has funded yet. It is built from public federal, state and county records. Every row links to its source and carries a verification label.</p>
      <h2>How it works</h2>
      <p><b>Collect</b> projects, awards and programs from public records. <b>Match</b> each county&apos;s wildfire risk to the money that reached it, and each unfunded project to programs and funders that fit. <b>Connect</b> a project to a funder or a crew, only after both say yes.</p>
      <h2>What we do not do</h2>
      <p>We do not publish contact details. We do not publish a project until a person has read it. We do not present modeled risk scores or award obligations as measured outcomes: every figure says which source it came from and what kind of figure it is.</p>
      <p style={{ marginTop: 24 }}><Link className="btn primary" href="/contact">Talk to the team</Link></p>
    </div>
  );
}
