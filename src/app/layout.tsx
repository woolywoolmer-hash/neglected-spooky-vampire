import type { Metadata } from 'next';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import './globals.css';
import './sport-regis.css';

export const metadata: Metadata = {
  title: 'Sport Regis · Facilities booking',
  description: 'Facilities booking for Port Regis sports and venue hire.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
