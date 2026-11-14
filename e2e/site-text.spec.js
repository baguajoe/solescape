import { expect, test } from '@playwright/test';

// The Site text page: Kerimah changes wording in the admin and the public pages show it.
// Each test resets what it changed through the API, so the desktop and phone runs start from the originals.

const ADMIN_PASSWORD = 'e2e-password';
const HEADLINE = 'A complete sole to soul recovery experience.';
const KEYS = ['home.headline', 'services.faq', 'about.bio', 'about.credentials', 'contact.service_area'];

async function signIn(page) {
  await page.goto('/admin');
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation', { name: 'Admin' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Site text' }).click();
  await expect(page.locator('h1')).toHaveText('Site text');
}

const block = (page, name) => page.getByRole('form', { name });

test.afterEach(async ({ request }) => {
  await request.post('/api/admin/login', { data: { password: ADMIN_PASSWORD } });
  for (const key of KEYS) await request.delete(`/api/admin/site-text/${key}`);
});

test('edit the Home headline, see it live, then reset it', async ({ page }) => {
  await signIn(page);
  const form = block(page, 'Home: Headline');
  const input = form.getByLabel('Headline');
  await expect(input).toHaveValue(HEADLINE);
  await expect(form.getByText(`${HEADLINE.length} / 120 characters`)).toBeVisible();
  await expect(form.getByRole('button', { name: 'Save' })).toBeDisabled();
  await expect(form.getByRole('button', { name: 'Reset to original' })).toBeDisabled();

  // HTML is refused, with a clear message
  await input.fill('Relief <b>now</b>');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form.getByRole('alert')).toContainText('Plain text only');

  // Over the limit: the count turns red and the save is refused
  await input.fill('x'.repeat(125));
  await expect(form.getByText('125 / 120 characters: 5 too many')).toBeVisible();
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form.getByRole('alert')).toContainText('The limit is 120');

  await input.fill('Healing feet, wherever you are.');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form.getByRole('status')).toHaveText("Saved. It's on the live site now.");
  await expect(form.getByText('Your wording')).toBeVisible();

  // "View the Home page" opens the live page in a new tab
  const [home] = await Promise.all([page.waitForEvent('popup'), form.getByRole('link', { name: /View the Home page/ }).click()]);
  await expect(home.locator('h1')).toHaveText('Healing feet, wherever you are.');
  await home.close();

  page.once('dialog', (d) => d.accept());
  await form.getByRole('button', { name: 'Reset to original' }).click();
  await expect(form.getByRole('status')).toContainText('Back to the original');
  await expect(input).toHaveValue(HEADLINE);
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText(HEADLINE);
});

test('add, reorder and delete questions on the Services page', async ({ page }) => {
  await signIn(page);
  const form = block(page, 'Services: Questions');
  await form.getByRole('button', { name: 'Add a question' }).click();
  await form.getByLabel('Question 8', { exact: true }).fill('Do you sell gift cards?');
  await form.getByLabel('Answer 8', { exact: true }).fill('Yes.\nText Kerimah to buy one.');
  await form.getByRole('button', { name: 'Move up question 8' }).click();
  await form.getByRole('button', { name: 'Delete question 1', exact: true }).click();
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form.getByRole('status')).toHaveText("Saved. It's on the live site now.");

  await page.goto('/services');
  const questions = page.locator('.faq summary');
  await expect(questions).toHaveCount(7);
  await expect(questions.first()).toHaveText('Do I need my own table or supplies?');
  await expect(questions.nth(5)).toHaveText('Do you sell gift cards?');
  await expect(page.getByText('Where are services held?')).toHaveCount(0);
  await questions.nth(5).click();
  const answer = page.locator('.faq details').nth(5).locator('p');
  await expect(answer).toHaveText('Yes.\nText Kerimah to buy one.');
  await expect(answer).toHaveCSS('white-space', 'pre-line'); // the line break shows
});

test('About and Contact show her edits, with line breaks', async ({ page, request }) => {
  await request.post('/api/admin/login', { data: { password: ADMIN_PASSWORD } });
  await request.put('/api/admin/site-text/about.bio', { data: { value: 'First line\nsecond line\n\nNew paragraph.' } });
  await request.put('/api/admin/site-text/about.credentials', { data: { value: 'Licensed in MA\nCertified in reflexology' } });
  await request.put('/api/admin/site-text/contact.service_area', { data: { value: 'All of Massachusetts' } });

  await page.goto('/about');
  const prose = page.locator('.prose p');
  await expect(prose).toHaveCount(2);
  await expect(prose.first()).toHaveText('First line\nsecond line');
  await expect(page.locator('.creds li')).toHaveText(['Licensed in MA', 'Certified in reflexology']);
  await page.goto('/');
  await expect(page.locator('.about p').first()).toHaveText('First line\nsecond line'); // Home shows the first paragraph
  await page.goto('/contact');
  await expect(page.locator('.ways li').last()).toContainText('All of Massachusetts');
});

test('pages show the original wording when the API is slow', async ({ page, request }) => {
  await request.post('/api/admin/login', { data: { password: ADMIN_PASSWORD } });
  await request.put('/api/admin/site-text/home.headline', { data: { value: 'Her newer headline' } });
  let release;
  const held = new Promise((r) => { release = r; });
  await page.route('**/api/site-text', async (route) => { await held; await route.continue(); });

  const start = Date.now();
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText(HEADLINE, { timeout: 4000 }); // never blank
  expect(Date.now() - start).toBeLessThan(4000);
  await expect(page.getByText('All equipment is provided for your service.')).toBeVisible();

  release(); // the API answers late: her text replaces the original
  await expect(page.locator('h1')).toHaveText('Her newer headline');
});

test('service descriptions and notes are edited on Services and products', async ({ page, request }) => {
  await page.goto('/admin');
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Services and products' }).click();
  const desc = page.getByLabel('Description for Sole Cleanse, 90 minutes');
  const row = page.locator('form.cat-row').filter({ has: desc });
  const text = 'Full body massage.\nFoot soak and hot towels.';
  await desc.fill(text);
  await expect(row.getByText(`${text.length} / 600 characters`)).toBeVisible();
  await row.getByRole('button', { name: 'Save' }).click();
  await expect(row.getByRole('button', { name: 'Saved' })).toBeVisible();

  await page.goto('/services');
  await expect(page.locator('#sole-cleanse li').nth(1).locator('p')).toHaveText('Full body massage.\nFoot soak and hot towels.');

  await page.goBack();
  page.once('dialog', (d) => d.accept());
  await row.getByRole('button', { name: /Reset to original/ }).click();
  await expect(desc).toHaveValue(/^60-min full body massage/);

  // Nothing left changed, in case the reset didn't run
  await request.post('/api/admin/login', { data: { password: ADMIN_PASSWORD } });
  const catalog = await (await request.get('/api/admin/catalog')).json();
  const s = catalog.services.find((x) => x.slug === 'sole-cleanse-90');
  expect(s.summary).toBe(s.original_summary);
});
