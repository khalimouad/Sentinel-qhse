import type { Metadata } from 'next';
import './globals.css';
import DemoBanner from '../components/DemoBanner';

export const metadata: Metadata = { title: 'Sentinelle — Pilotage intégré', description: 'Plateforme QHSE, risques et conformité pour vos organisations en Afrique et en Europe.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body><DemoBanner/>{children}</body></html>;
}
