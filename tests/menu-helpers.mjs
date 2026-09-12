export async function openMenu(page) {
  if (!await page.locator('#menu').evaluate(menu => menu.open)) await page.getByRole('button', { name: 'Open game menu', exact: true }).click();
}
export async function resumeDriving(page) {
  if (await page.locator('#adventure-dialog').evaluate(dialog => dialog.open)) await page.getByRole('button', { name: 'Close adventure book' }).click();
  if (await page.locator('#menu').evaluate(menu => menu.open)) await page.getByRole('button', { name: 'Back to the fresh air' }).click();
}
export async function menuAction(page, name) {
  await openMenu(page);
  await page.getByRole('button', { name, exact: typeof name === 'string' }).click();
  if (await page.locator('#menu').evaluate(menu => menu.open)) await resumeDriving(page);
}
