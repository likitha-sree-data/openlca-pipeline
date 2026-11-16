import Link from 'next/link';
import { Check } from 'lucide-react';
import PublicMap from '@/components/public/PublicMap';
import { headline, homeFacts, layerCounts, projectFilterOptions, story } from '@/lib/public-data';
import { fmtDate, fmtInt, fmtMoney, todayIso } from '@/lib/format';
import { PROJECT_STAGES } from '@/lib/constants';
import { categoriesOpts } from '@/lib/util-opts';

const FAQ = [
  ['Who is TruSemble for?', 'Funders who want to back wildfire work that is ready, the communities and districts doing that work, and the insurers, utilities, agencies and investors who need to know where money has and has not gone.'],
  ['Where does the record come from?', 'Public sources only: USAspending, FEMA Hazard Mitigation Assistance and the National Risk Index, Grants.gov, Oregon Department of Forestry award lists and county rosters. Every row links back to its source.'],
  ['Is every record checked?', 'Not yet. Every record says "not yet checked" until the TruSemble team compares it with its source, starting with Deschutes County, Oregon.'],
  ['How does TruSemble make money?', 'A monthly brief and data licenses for funders, insurers, utilities and agencies, and support for funders placing money with projects.'],
  ['Who decides when an introduction is made?', 'Both sides. TruSemble introduces a project to a funder or a crew only after each says yes.'],
];

export default function Home() {
  const h = headline();
  const f = homeFacts();
  const st = story();
  const counts = layerCounts();
  const opts = projectFilterOptions();
  return (
    <>
      <section className="container hero">
        <h1>See where wildfire money goes, and where it does not</h1>
        <p className="lead">TruSemble keeps one sourced record of wildfire mitigation across the US: the projects, the money that paid for them, and the high-risk places nobody has funded yet. Funders use it to find work worth backing. Communities use it to get in line for the money.</p>
        <div className="actions">
          <Link href="/fund" className="btn primary">Fund the work →</Link>
          <Link href="/request-funding" className="btn">Get funded</Link>
          <Link href="/data" className="link link-arrow">See the data</Link>
        </div>
      </section>

      <section className="container" aria-label="Live map" style={{ paddingBottom: 12 }}>
        <PublicMap variant="hero" categories={categoriesOpts} stages={PROJECT_STAGES.map((s) => [s[0], s[1]] as [string, string])} options={opts} counts={counts} initial={{ layers: ['projects', 'gap'] }} pageSize={50} />
        <p className="small muted" style={{ marginTop: 16, maxWidth: 560 }}>
          Live map from public federal, state and county records. Red counties are in the top quarter for FEMA wildfire risk with no county-level wildfire award on record. Records say "not yet checked" until the TruSemble team checks them. No contact details are shown.
        </p>
      </section>

      <section className="container section">
        <h2 className="big">The money is real<span>and it misses most of the places at risk</span></h2>
        <p className="lede">Federal, state and county programs pay for wildfire work every year. Put that spending next to FEMA&apos;s wildfire risk for every county and the gap is plain to see.</p>
        <h3 style={{ fontSize: 'clamp(26px,3.6vw,38px)', margin: '48px 0 16px' }}>What the record shows, as of {fmtDate(todayIso())}</h3>
        <div className="facts" role="table" aria-label="Figures from the record">
          <div className="fact" role="row"><div role="cell"><b className="k">Counties at high risk, no award</b><p>Top quarter of US counties for FEMA wildfire risk, with no county-level wildfire award on record</p></div><div className="v num" role="cell">{fmtInt(f.gapCount)}</div></div>
          {f.waitingCount > 0 && <div className="fact" role="row"><div role="cell"><b className="k">Waiting on FEMA</b><p>Wildfire mitigation projects submitted to FEMA and still seeking funding, across {fmtInt(f.waitingCount)} subapplications</p></div><div className="v num" role="cell">{fmtMoney(f.waitingTotal, { compact: true })}</div></div>}
          {st?.oregon && <div className="fact" role="row"><div role="cell"><b className="k">Oregon, 2026</b><p>Applications funded by the state&apos;s Small Forestland Grant round, out of {st.oregon.applications}</p></div><div className="v num" role="cell">{st.oregon.funded}</div></div>}
          <div className="fact" role="row"><div role="cell"><b className="k">In the record</b><p>Mitigation projects and {fmtInt(f.awards)} awards, each linked to its public source</p></div><div className="v num" role="cell">{fmtInt(f.projects)}</div></div>
        </div>
        <p style={{ margin: '20px 0 16px', maxWidth: 640 }}><b>What is missing:</b> a way for the people with money to see the work that is ready and waiting.</p>
        <p className="tiny muted" style={{ marginBottom: 16 }}>Sources: FEMA National Risk Index and Hazard Mitigation Assistance, USAspending, Oregon Department of Forestry. Figures describe the public record, not TruSemble results.</p>
        <Link className="btn" href="/projects?layers=gap">Open the gap map</Link>
      </section>

      {st && (
        <section className="container section" style={{ paddingTop: 0 }}>
          <h2 className="big">{st.headline}<span>{st.sub}</span></h2>
          <p className="lede">{st.body}</p>
          <ul className="stat-grid" style={{ listStyle: 'none', padding: 0, margin: '28px 0' }}>
            {st.items.map((i) => (
              <li key={i.title} style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
                <h3 style={{ fontSize: 22, marginBottom: 8 }}>{i.projectId ? <Link href={`/projects/${i.projectId}`}>{i.title}</Link> : i.title}</h3>
                <p style={{ display: 'flex', gap: 8 }}><Check size={18} color="var(--ok)" aria-hidden style={{ flex: 'none', marginTop: 3 }} />{i.line}</p>
              </li>
            ))}
          </ul>
          <Link href="/fund" className="link link-arrow">Fund the work</Link>
        </section>
      )}

      <section className="container section" style={{ paddingTop: 0 }}>
        <h2 className="big">Three ways in<span>depending on what you bring</span></h2>
        <div className="ways">
          {[
            ['Fund the work', 'Foundations, donors and public programs', 'Ready projects that were turned down, each with its scope and source. Back one directly.', '/fund'],
            ['Get funded', 'HOAs, Firewise communities and fire districts', 'See which programs fit, size the ask and get introduced to a funder or a crew.', '/request-funding'],
            ['Use the data', 'Insurers, utilities, agencies and investors', "Every county's wildfire risk next to the money that reached it, as a monthly brief or a data license.", '/data'],
          ].map(([t, who, body, href]) => (
            <div key={t} className="way"><h3 style={{ fontSize: 24 }}>{t}</h3><span className="who">{who}</span><p>{body}</p><Link className="link link-arrow" href={href}>{t}</Link></div>
          ))}
        </div>
      </section>

      <section className="container section" style={{ paddingTop: 0 }}>
        <h2 className="big">From the public record<span>to a funded project</span></h2>
        <p className="lede">Every step runs on pages anyone can open. Contact details stay private.</p>
        <div className="steps-tabs" aria-label="Steps"><span>Find</span><span>Match</span><span>Fund</span><span>Connect</span></div>
        <div className="cols3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
          {[
            ['Find the gap on the map', 'Every project in the record on one map, with FEMA wildfire risk and the funding each county has received.', '/projects?layers=gap', 'Open the map'],
            ['See which money fits', 'State, federal, county and private funding side by side, each with who runs it, what it pays for and when it is open.', '/funding', 'Browse programs'],
            ['A funder reads one page', 'Each project has a public page with its scope, the programs that fit and what it has been awarded or refused.', '/projects', 'See project pages'],
            ['Make the introduction', 'A funder picks a project, the community confirms the scope, and the team introduces them.', '/request-funding', 'Request funding'],
          ].map(([t, b, href, cta]) => (
            <div key={t} className="card" style={{ marginTop: 0 }}><h3 style={{ fontSize: 22, marginBottom: 8 }}>{t}</h3><p className="muted" style={{ marginBottom: 14 }}>{b}</p><Link className="link link-arrow" href={href}>{cta}</Link></div>
          ))}
        </div>
      </section>

      <section className="container section" style={{ paddingTop: 0 }}>
        <h2 className="big">Collect, match, connect<span>starting in Deschutes County</span></h2>
        <p className="lede">The record covers every US county. Checking records and making the first introductions starts in Deschutes County, Oregon.</p>
        <div className="cols3">
          <div><h3>Collect</h3><p className="muted">Projects, awards and programs from federal, state and county records, every row linked to where it came from.</p></div>
          <div><h3>Match</h3><p className="muted">Put each county&apos;s wildfire risk next to the money that reached it, and each unfunded project next to the programs and funders that fit.</p></div>
          <div><h3>Connect</h3><p className="muted">Introduce a project to a funder or a crew, only after both say yes, and keep the record of what happened.</p></div>
        </div>
      </section>

      <section className="container narrow section faq" style={{ paddingTop: 0 }}>
        <h2 className="big">Questions,<span>plainly answered</span></h2>
        <div style={{ marginTop: 24, borderTop: '1px solid var(--line)' }}>
          {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
        </div>
      </section>

      <section className="container">
        <div className="cta-band">
          <h2>Back the work<span>the record shows is waiting</span></h2>
          <p className="lede" style={{ margin: '16px auto 24px', fontSize: 19 }}>Fund a project, get the monthly brief, or talk to the team about the data.</p>
          <div className="row" style={{ justifyContent: 'center' }}><Link className="btn primary" href="/fund">Fund the work →</Link><Link className="btn" href="/contact">Talk to the team</Link></div>
          <p className="tiny muted" style={{ marginTop: 20 }}>{fmtInt(h.projects)} projects · {fmtInt(h.programs)} programs · {fmtInt(h.sources)} sources</p>
        </div>
      </section>
    </>
  );
}
