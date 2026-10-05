import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';

export const metadata = {
  title: 'RdPosti',
  description: "RdPosti: disponi i banchi dell'aula e genera i posti rispettando le incompatibilità.",
  icons: {
    icon: [
      { url: '/assets/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/assets/favicon.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/assets/favicon.png',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="it">
      <body>
        {children}
        {/* Vercel: visite (Web Analytics) e velocità reale (Speed Insights) */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
