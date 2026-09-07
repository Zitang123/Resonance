import type { Metadata } from 'next';
import './globals.css';
import './room-motion.css';
import './karina.css';
export const metadata: Metadata = {
  title: 'Resonance — Your listening room',
  icons: { icon: '/favicon.svg' },
  description:
    'Find your next listen. Remember why it mattered. A private music collection, listening journal, and place for your musical memories.',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
