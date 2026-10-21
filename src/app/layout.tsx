import type { Metadata, Viewport } from 'next';
import { cookies, headers } from 'next/headers';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { getLang } from '@/i18n/server';
import { DENSITY_COOKIE, THEME_BOOT_SCRIPT, THEME_COOKIE, htmlThemeAttrs } from '@/lib/theme';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'KnowledgeHub',
  description: 'Notes, tasks, SAP and team management in one calm place.',
};

export async function generateViewport(): Promise<Viewport> {
  const light = (await cookies()).get(THEME_COOKIE)?.value === 'light';
  // viewport-fit=cover: phones draw under the notch / home bar; the shell pads
  // with env(safe-area-inset-*) (D68)
  return { themeColor: light ? '#ece7e1' : '#121315', viewportFit: 'cover' };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  const jar = await cookies();
  // theme + list density chosen in Definições (cookies mirrored from prefs)
  const look = htmlThemeAttrs(jar.get(THEME_COOKIE)?.value, jar.get(DENSITY_COOKIE)?.value);
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html
      lang={lang}
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      {...look}
      // the boot script / ThemeSync may change data-theme before hydration
      suppressHydrationWarning
    >
      <head>
        {look['data-theme-pref'] === 'system' && (
          <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        )}
      </head>
      <body>
        <Providers lang={lang}>{children}</Providers>
      </body>
    </html>
  );
}
