import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Sentinelle — Pilotage intégré', description: 'Plateforme QHSE, risques et conformité pour vos organisations en Afrique et en Europe.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body>{children}</body></html>;
}
