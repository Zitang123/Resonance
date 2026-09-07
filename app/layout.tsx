import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'Resonance — Your listening room',description:'Find your next listen. Remember why it mattered. A private music collection, listening journal, and place for your musical memories.'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en" className="dark"><body>{children}</body></html>}
