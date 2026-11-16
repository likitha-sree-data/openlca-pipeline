import type { Metadata } from 'next';
import { CheckCircle2, Circle } from 'lucide-react';
import { OpsPage } from '@/components/ops/Shell';
import { alertChannels } from '@/lib/notify';
import { TestAlert } from './TestAlert';

export const metadata: Metadata = { title: 'Alerts' };

export default function SettingsPage() {
  const ch = alertChannels();
  const row = (on: boolean, title: string, detail: string) => (
    <li className="row" style={{ gap: 12, alignItems: 'flex-start', padding: '12px 0', borderTop: '1px solid var(--line)' }}>
      {on ? <CheckCircle2 color="var(--ok)" aria-label="Set up" /> : <Circle color="var(--muted-2)" aria-label="Not set up" />}
      <div><b>{title}</b><div className="small muted">{detail}</div></div>
    </li>
  );
  return (
    <OpsPage section="Settings">
      <h1>Alerts</h1>
      <p className="lede">The team hears about new requests the moment they arrive, plus one summary each week. Nobody has to keep checking the inbox.</p>
      <section className="card" style={{ marginTop: 20 }}>
        <h2>What is set up</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
          {row(ch.email, 'Email', ch.email ? `Sending to ${ch.emailTo.join(', ')}` : 'Not set up yet')}
          {row(ch.webhook, 'Chat or automation link', ch.webhook ? 'A link is set up (for example a Slack channel)' : 'Not set up yet')}
        </ul>
        <div style={{ marginTop: 16 }}><TestAlert /></div>
      </section>
      <details className="card">
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>How to set this up (for whoever looks after the site)</summary>
        <div className="stack" style={{ marginTop: 12 }}>
          <p><b>Email.</b> Create a free account with an email sending service (this app talks to Resend). Then add three settings where the site runs: <code>RESEND_API_KEY</code>, <code>NOTIFY_EMAIL_FROM</code> (an address on your own domain) and <code>NOTIFY_EMAIL_TO</code> (who should get alerts, separated by commas).</p>
          <p><b>Chat.</b> In Slack, Teams or Zapier, create an incoming link and put it in <code>NOTIFY_WEBHOOK_URL</code>.</p>
          <p><b>The weekly summary.</b> Ask your host to run <code>npm run summary</code> every Monday morning, and <code>npm run refresh</code> every night to bring in fresh public data.</p>
          <p className="small muted">Alerts name the group and the project. They never include anyone&apos;s email address or phone number.</p>
        </div>
      </details>
    </OpsPage>
  );
}
