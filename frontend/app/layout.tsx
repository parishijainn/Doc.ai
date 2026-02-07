import type { Metadata } from 'next';
import './globals.css';
import { AppLayout } from '../components/AppLayout';

export const metadata: Metadata = {
  title: 'CareZoom – Your health visit, simplified',
  description: 'Video visit support for older adults. Triage guidance, education, and care navigation—not a substitute for a doctor.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="min-h-full">
      <head>
        <meta name="theme-color" content="#f8fafc" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=2" />
      </head>
      <body className="min-h-full antialiased">
        <AppLayout>{children}</AppLayout>
      </body>
    </html>
  );
}
