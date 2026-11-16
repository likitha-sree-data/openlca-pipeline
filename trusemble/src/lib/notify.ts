export type Alert = { title: string; lines: string[]; path?: string };

const env = (k: string) => (process.env[k] ?? '').trim();

export function alertChannels() {
  const emailTo = env('NOTIFY_EMAIL_TO').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    webhook: !!env('NOTIFY_WEBHOOK_URL'),
    email: !!env('RESEND_API_KEY') && !!env('NOTIFY_EMAIL_FROM') && emailTo.length > 0,
    emailTo,
  };
}

const absolute = (path?: string) => (path ? `${(env('SITE_URL') || 'http://localhost:3000').replace(/\/$/, '')}${path}` : '');

type Fetch = (url: string, init: RequestInit) => Promise<{ ok: boolean; status: number }>;

/**
 * Tell the team something happened. Sends to a chat or automation webhook and/or by email, whichever are set up.
 * Never throws: a failed alert must not break the thing that triggered it. Alerts carry no personal details.
 */
export async function sendAlert(a: Alert, impl: Fetch = fetch as unknown as Fetch): Promise<{ sent: string[]; failed: string[] }> {
  const sent: string[] = [];
  const failed: string[] = [];
  const url = absolute(a.path);
  const text = [a.title, ...a.lines, url].filter(Boolean).join('\n');
  const ch = alertChannels();
  if (ch.webhook) {
    try {
      const r = await impl(env('NOTIFY_WEBHOOK_URL'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, title: a.title, lines: a.lines, url }), signal: AbortSignal.timeout(5000) });
      (r.ok ? sent : failed).push('chat or automation link');
    } catch { failed.push('chat or automation link'); }
  }
  if (ch.email) {
    try {
      const r = await impl('https://api.resend.com/emails', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env('RESEND_API_KEY')}` },
        body: JSON.stringify({ from: env('NOTIFY_EMAIL_FROM'), to: ch.emailTo, subject: a.title, text }), signal: AbortSignal.timeout(5000),
      });
      (r.ok ? sent : failed).push('email');
    } catch { failed.push('email'); }
  }
  return { sent, failed };
}
