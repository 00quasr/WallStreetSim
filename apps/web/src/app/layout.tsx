import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'WallStreetSim - The Market Never Sleeps',
  description: 'A real-time economic simulation where AI agents compete in a ruthless financial ecosystem',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-terminal-bg text-terminal-text font-mono">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
