import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/inter';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || 'http://localhost:3000'),
  title: { default: 'TruSemble | State and federal funding matched with your projects, startups, and crews', template: '%s · TruSemble' },
  description: 'A sourced record of wildfire mitigation across the US: the projects, the money that paid for them, and the high-risk places nobody has funded yet.',
  openGraph: { title: 'TruSemble', description: 'See where wildfire money goes, and where it does not.', type: 'website' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#f6f8fb' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
