import { expect, test } from '@playwright/test';

const ADMIN_PASSWORD = 'e2e-password';

/** Opens the menu on phone layouts so nav links are clickable. */
async function openMenu(page) {
  const menu = page.getByRole('button', { name: 'Menu' });
  if (await menu.isVisible()) await menu.click();
}

/** Picks the first open day (this month or later) and its first time. Returns the time label. */
async function pickFirstSlot(page) {
  for (let i = 0; i < 3; i += 1) {
    await expect(page.getByText('Checking the calendar…')).toHaveCount(0);
    const open = page.locator('.cal-day:not([disabled])');
    if (await open.count()) {
      await open.first().click();
      const slot = page.locator('.slot').first();
      await expect(slot).toBeVisible();
      const label = await slot.textContent();
      await slot.click();
      return label;
    }
    await page.getByRole('button', { name: 'Next month' }).click();
  }
  throw new Error('No open days found in the next three months');
}

test.describe('public pages', () => {
  test('every page loads without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500) errors.push(`${r.status()} ${r.url()}`); });

    for (const [url, heading] of [
      ['/', null], ['/services', null], ['/about', null], ['/contact', null], ['/book', 'Book an appointment'],
    ]) {
      await page.goto(url);
      await expect(page.locator('h1').first()).toBeVisible();
      if (heading) await expect(page.locator('h1')).toHaveText(heading);
      await expect(page).toHaveTitle(/SoleScape/);
    }
    await page.goto('/no-such-page');
    await expect(page.locator('h1')).toHaveText("That page isn't here");
    expect(errors).toEqual([]);
  });

  test('images load', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const broken = await page.locator('img').evaluateAll((imgs) =>
      imgs.filter((i) => i.loading !== 'lazy' && i.complete && i.naturalWidth === 0).map((i) => i.src));
    expect(broken).toEqual([]);
  });

  test('navigation and demo bar', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Demo mode: no real payments are taken.')).toBeVisible();
    await openMenu(page);
    await page.locator('#main-nav').getByRole('link', { name: 'Services' }).click();
    await expect(page).toHaveURL(/\/services$/);
    await openMenu(page);
    await page.locator('#main-nav').getByRole('link', { name: 'Book now' }).click();
    await expect(page).toHaveURL(/\/book$/);
  });

  test('contact form sends a message', async ({ page }) => {
    await page.goto('/contact');
    await page.getByLabel('Name').fill('E2E Tester');
    await page.getByLabel('Email').fill('not-an-email');
    await page.getByLabel('Message').fill('Do you travel to Quincy for office parties?');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.getByLabel('Email').fill('e2e@example.com');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByRole('status')).toContainText('Your message was sent');
    await expect(page.getByLabel('Message')).toHaveValue('');
  });
});

test.describe('booking', () => {
  test('book, pay the demo deposit, reschedule, then cancel', async ({ page }) => {
    await page.goto('/book');
    await page.getByText('60 minutes').first().click();
    await expect(page.locator('.summary')).toContainText('Total');
    await pickFirstSlot(page);

    // Required-field validation comes from the server
    const pay = page.getByRole('button', { name: /Pay \$75 deposit/ });
    await pay.click();
    await expect(page.getByRole('alert')).toBeVisible();

    await page.getByLabel('Street address').fill('1 Main St, Boston MA');
    await page.getByLabel('Full name').fill('Ada Tester');
    await page.getByLabel('Email').fill('ada@example.com');
    await page.getByLabel('Mobile phone').fill('617-555-0100');
    await page.getByLabel('I agree to the reservation policies').check();
    await pay.click();
    await expect(page.getByRole('alert')).toContainText('Choose your area');
    await page.getByLabel('Other', { exact: true }).check();
    await pay.click();

    await expect(page).toHaveURL(/\/demo-pay\/booking\//);
    await page.getByRole('button', { name: 'Complete test payment' }).click();

    await expect(page).toHaveURL(/\/booking\//);
    await expect(page.locator('h1')).toHaveText("You're booked, Ada");
    await expect(page.locator('.receipt')).toContainText('$75');
    await expect(page.getByRole('link', { name: 'Add to my calendar' })).toBeVisible();

    // Calendar file downloads
    const ics = await page.request.get(await page.getByRole('link', { name: 'Add to my calendar' }).getAttribute('href'));
    expect(ics.ok()).toBeTruthy();
    expect(await ics.text()).toContain('BEGIN:VCALENDAR');

    // Reschedule once
    await page.getByRole('button', { name: 'Reschedule' }).click();
    await page.getByRole('button', { name: 'Next month' }).click();
    await pickFirstSlot(page);
    await page.getByRole('button', { name: /^Move to/ }).click();
    await expect(page.getByRole('status')).toContainText('has been moved');
    await expect(page.getByRole('button', { name: 'Reschedule' })).toHaveCount(0);

    // Cancel
    await page.getByRole('button', { name: 'Cancel appointment' }).click();
    await page.locator('.panel').getByRole('button', { name: 'Cancel appointment' }).click();
    await expect(page.locator('h1')).toHaveText('This appointment is cancelled');
  });

  test('hourly event enforces the 3-hour minimum', async ({ page }) => {
    await page.goto('/book');
    await page.getByText('3-hour minimum').first().click();
    await expect(page.locator('.hours output')).toHaveText('3');
    await expect(page.getByRole('button', { name: 'Fewer hours' })).toBeDisabled();
    await page.getByRole('button', { name: 'More hours' }).click();
    await expect(page.locator('.hours output')).toHaveText('4');
    await expect(page.locator('.summary')).toContainText('4 hours');
  });
});

test.describe('owner admin', () => {
  test('rejects a wrong password, then signs in and opens every tab', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/admin');
    await page.getByLabel('Password').fill('wrong');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toBeVisible();

    await page.getByLabel('Password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    const nav = page.getByRole('navigation', { name: 'Admin' });
    await expect(nav).toBeVisible();

    for (const tab of ['Messages', 'Orders', 'Services and products', 'Corporate clients', 'Hours and time off', 'Settings', 'Calendar']) {
      await nav.getByRole('link', { name: tab }).click();
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('alert')).toHaveCount(0);
    }

    await nav.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Owner sign in' })).toBeVisible();
    expect(errors).toEqual([]);
  });
});
