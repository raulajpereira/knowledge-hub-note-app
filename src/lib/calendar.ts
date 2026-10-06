// Calendar helpers (prototype isoD / ptHolidays).

export const isoD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Portuguese public holidays of a year (fixed + Easter-based), [pt, en] by YYYY-MM-DD. */
export function ptHolidays(y: number): Record<string, [string, string]> {
  // Anonymous Gregorian algorithm (Meeus/Jones/Butcher) for Easter Sunday.
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mo = Math.floor((h + l - 7 * m + 114) / 31);
  const da = ((h + l - 7 * m + 114) % 31) + 1;
  const off = (n: number) => isoD(new Date(y, mo - 1, da + n));
  return {
    [`${y}-01-01`]: ['Ano Novo', 'New Year'],
    [off(-47)]: ['Carnaval', 'Carnival'],
    [off(-2)]: ['Sexta-feira Santa', 'Good Friday'],
    [off(0)]: ['Páscoa', 'Easter'],
    [`${y}-04-25`]: ['Dia da Liberdade', 'Freedom Day'],
    [`${y}-05-01`]: ['Dia do Trabalhador', 'Labour Day'],
    [off(60)]: ['Corpo de Deus', 'Corpus Christi'],
    [`${y}-06-10`]: ['Dia de Portugal', 'Portugal Day'],
    [`${y}-06-13`]: ['Santo António', 'St Anthony'],
    [`${y}-08-15`]: ['Assunção de Nossa Senhora', 'Assumption'],
    [`${y}-10-05`]: ['Implantação da República', 'Republic Day'],
    [`${y}-11-01`]: ['Todos os Santos', 'All Saints'],
    [`${y}-12-01`]: ['Restauração da Independência', 'Independence Restoration'],
    [`${y}-12-08`]: ['Imaculada Conceição', 'Immaculate Conception'],
    [`${y}-12-25`]: ['Natal', 'Christmas'],
  };
}
