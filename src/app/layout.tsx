import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { getLang } from '@/i18n/server';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'KnowledgeHub',
  description: 'Notes, tasks, SAP and team management in one calm place.',
};

export const viewport: Viewport = { themeColor: '#121315' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang} className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <Providers lang={lang}>{children}</Providers>
      </body>
    </html>
  );
}
