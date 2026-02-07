import type { Metadata } from 'next';
import './globals.css';
import { AppLayout } from '../components/AppLayout';

export const metadata: Metadata = {
  title: 'CareZoom – Your health visit, simplified',
  description: 'Video visit support for older adults. Triage guidance, education, and care navigation—not a substitute for a doctor.',
};

export const viewport = {
  themeColor: '#f8fafc',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 2,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="min-h-full">
      <body className="min-h-full antialiased">
        <AppLayout>{children}</AppLayout>
      </body>
    </html>
  );
}

