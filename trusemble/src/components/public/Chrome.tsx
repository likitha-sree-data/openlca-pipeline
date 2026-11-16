import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { DesktopNav, MobileMenu } from './Nav';
import { BRAND } from '@/lib/constants';

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container bar">
        <Logo />
        <DesktopNav />
        <div className="row" style={{ gap: 10 }}>
          <Link href="/submit-project" className="btn primary header-cta">Submit a project</Link>
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const email = process.env.CONTACT_EMAIL || 'hello@example.org';
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="cols">
          <p style={{ maxWidth: 340, fontSize: 18 }}>{BRAND.tagline} {BRAND.byline}</p>
          <div>
            <h4>The public app</h4>
            <ul>
              <li><Link href="/projects">Explore the map</Link></li>
              <li><Link href="/data">See the data</Link></li>
              <li><Link href="/funding">See funding programs</Link></li>
              <li><Link href="/request-funding">Request funding or a crew</Link></li>
              <li><Link href="/submit-project">Submit a project</Link></li>
            </ul>
          </div>
          <div>
            <h4>This site</h4>
            <ul>
              <li><Link href="/calculator">Funding calculator</Link></li>
              <li><Link href="/fund">Fund the work</Link></li>
              <li><Link href="/about">About</Link></li>
              <li><Link href="/contact">Contact the team</Link></li>
            </ul>
          </div>
        </div>
        <div className="legal">
          <span>Every record keeps its source. Contact details are never published. © {new Date().getFullYear()} TruSemble · <a href={`mailto:${email}`}>{email}</a></span>
          <span><Link href="/privacy">Privacy</Link> &nbsp; <Link href="/terms">Terms</Link></span>
        </div>
        <div className="wordmark" aria-hidden="true">TruSemble</div>
      </div>
    </footer>
  );
}
