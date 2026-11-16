import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Privacy' };

export default function Privacy() {
  const email = process.env.CONTACT_EMAIL || 'hello@example.org';
  return (
    <div className="container narrow legal-body" style={{ paddingBottom: 56 }}>
      <div className="page-title"><h1>Privacy</h1><p>Plain-language summary of what this site collects and why. Last updated November 2026.</p></div>
      <h2>What we collect</h2>
      <p>When you send a form (request funding, submit a project, contact the team, request an introduction) we store what you typed: your name, email, optional phone, your organization and the project details. We keep a short-lived, salted hash of your network address to limit abuse; the address itself is not stored.</p>
      <h2>How it is used</h2>
      <p>To reply to you and to match projects with funders and crews. Your name, email and phone are private to the TruSemble team. They never appear on the public map, project pages or data pages. We introduce you to a funder, crew or partner only after you have said yes.</p>
      <h2>Public records</h2>
      <p>The public record is built from organizations and projects named in government sources. It contains organizations, not people.</p>
      <h2>Your choices</h2>
      <p>To see, correct or delete what we hold about you, or to remove a record from the public map, email <a className="link" href={`mailto:${email}`}>{email}</a>.</p>
      <h2>Cookies</h2>
      <p>The public site sets no tracking cookies. Operators signing in to the internal app receive a session cookie.</p>
    </div>
  );
}
