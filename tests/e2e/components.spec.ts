import { expect, test } from '@playwright/test';

// Behaviour of the Phase 1 primitives, exercised through the /ui catalogue
// (served by production builds when KH_UI_CATALOG=true).
test.use({ locale: 'pt-PT' });

test('select: keyboard open, filter, pick; Escape closes', async ({ page }) => {
  await page.goto('ui/select');
  const combo = page.getByRole('combobox', { name: 'Transação' });
  await combo.focus();
  await page.keyboard.press('Enter');
  const search = page.getByPlaceholder('Pesquisar…');
  await expect(search).toBeFocused(); // > 10 options → filter box
  await page.keyboard.type('sm3');
  await expect(page.getByRole('option')).toHaveCount(2); // SM30, SM37
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(combo).toHaveText(/SM37/);
  await expect(combo).toBeFocused();

  await page.getByRole('combobox', { name: 'Prioridade' }).click();
  await expect(page.getByRole('option', { name: 'Crítica' })).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
});

test('modal: confirm stacks above it and Escape closes one layer at a time', async ({ page }) => {
  await page.goto('ui/modal');
  const opener = page.locator('[data-demo=open-modal]');
  await opener.click();
  const modal = page.getByRole('dialog', { name: 'Editar sistema' });
  await expect(modal).toBeVisible();
  await page.locator('[data-demo=stack-confirm]').click();
  await expect(page.getByRole('dialog')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Eliminar', exact: true }).last()).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(modal).toBeVisible();
  await expect(page.getByText('Cancelado.')).toBeVisible(); // toast from the cancelled confirm

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused(); // focus restored
});

test('table: dragging a column edge resizes it, persists, double-click resets', async ({ page }) => {
  await page.goto('ui/table');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const header = page.getByRole('columnheader').first();
  const before = (await header.boundingBox())!.width;
  const grip = page.locator('.kh-table__grip').first();
  const g = (await grip.boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + 10);
  await page.mouse.down();
  await page.mouse.move(g.x + 100, g.y + 10, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await header.boundingBox())!.width).toBeGreaterThan(before + 80);

  await page.reload();
  await expect
    .poll(async () => (await page.getByRole('columnheader').first().boundingBox())!.width)
    .toBeGreaterThan(before + 80);

  await page.locator('.kh-table__grip').first().dblclick();
  await expect
    .poll(async () => Math.round((await page.getByRole('columnheader').first().boundingBox())!.width))
    .toBe(Math.round(before));
});

test('table: header click sorts and row click selects', async ({ page }) => {
  await page.goto('ui/table');
  const firstCell = () => page.getByRole('row').nth(1).getByRole('cell').first();
  await expect(firstCell()).toHaveText('BSD - DEV');
  await page
    .getByRole('button', { name: /Sistema/ })
    .first()
    .click(); // asc → desc
  await expect(firstCell()).toHaveText('ECP - QAS');
  await page.getByRole('row').nth(1).click();
  await expect(page.getByRole('row').nth(1)).toHaveAttribute('aria-selected', 'true');
});

test('drawer: handle drag widens the panel within its limits', async ({ page }) => {
  await page.goto('ui/drawer');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const handle = page.getByRole('separator');
  await expect(handle).toHaveAttribute('aria-valuenow', '420');
  const h = (await handle.boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x - 1000, h.y + h.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(handle).toHaveAttribute('aria-valuenow', '760'); // clamped to max
  await handle.dblclick();
  await expect(handle).toHaveAttribute('aria-valuenow', '420');
});

test('i18n: switching to EN translates components and survives a reload', async ({ page }) => {
  await page.goto('ui/table');
  await expect(page.getByRole('columnheader').first()).toHaveText(/Sistema/);
  await page.getByRole('radio', { name: 'EN' }).first().click();
  await expect(page.getByRole('columnheader').first()).toHaveText(/System/);
  await page.reload();
  await expect(page.getByRole('columnheader').first()).toHaveText(/System/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('toast and checkbox/switch semantics', async ({ page }) => {
  await page.goto('ui/toast');
  await page.locator('[data-demo=toast-error]').click();
  await expect(page.getByRole('alert').filter({ hasText: 'Não foi possível guardar' })).toBeVisible();
  await page.getByRole('button', { name: 'Dispensar' }).first().click();
  await expect(page.getByRole('alert').filter({ hasText: 'Não foi possível guardar' })).toHaveCount(0);

  await page.goto('ui/toggles');
  const cb = page.getByRole('checkbox', { name: 'Lembrar-me' });
  await expect(cb).toHaveAttribute('aria-checked', 'true');
  await cb.click();
  await expect(cb).toHaveAttribute('aria-checked', 'false');
  const sw = page.getByRole('switch', { name: 'Notícias no rodapé' });
  await sw.press('Space');
  await expect(sw).toHaveAttribute('aria-checked', 'true');
});
