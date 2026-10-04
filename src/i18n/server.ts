import 'server-only';
import { cookies, headers } from 'next/headers';
import { LANG_COOKIE, isLang, langFromAcceptLanguage, type Lang } from '.';

// Language for server rendering: explicit choice (cookie) wins, then the
// browser's Accept-Language. Once auth exists, user_prefs.lang takes over.
export async function getLang(): Promise<Lang> {
  const fromCookie = (await cookies()).get(LANG_COOKIE)?.value;
  if (isLang(fromCookie)) return fromCookie;
  return langFromAcceptLanguage((await headers()).get('accept-language'));
}
