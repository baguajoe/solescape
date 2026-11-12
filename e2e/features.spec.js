import { expect, test } from '@playwright/test';

// Calendar blocking, weekly specials and the corporate program, clicked through as Kerimah and as a client.
// Each test cleans up through the API so the desktop and phone runs don't see each other's data.

const ADMIN_PASSWORD = 'e2e-password';

async function adminApi(request) {
  const r = await request.post('/api/admin/login', { data: { password: ADMIN_PASSWORD } });
  expect(r.ok()).toBeTruthy();
  return request;
}

async function signIn(page) {
  await page.goto('/admin');
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation', { name: 'Admin' })).toBeVisible();
}

async function adminTab(page, name) {
  await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name }).click();
  await expect(page.locator('h1')).toHaveText(name);
}

/** A Tuesday a few weeks out, different for desktop and phone runs. Returns { key: 'YYYY-MM-DD', date }. */
function futureTuesday(testInfo, extraWeeks = 0) {
  const d = new Date();
  d.setDate(d.getDate() + 14 + 7 * extraWeeks + (testInfo.project.name === 'phone' ? 21 : 0));
  d.setDate(d.getDate() + ((2 - d.getDay() + 7) % 7));
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { key, date: d };
}

async function openAdminDay(page, date) {
  const label = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const day = page.locator('.cal-big').getByRole('button', { name: new RegExp(`^${label}(,|$)`) });
  for (let i = 0; i < 3 && !(await day.count()); i += 1) await page.getByRole('button', { name: 'Next month' }).click();
  await day.click();
  await expect(page.locator('section[aria-label="Selected day"] h2').first()).toHaveText(label);
  return day;
}

async function slotLabels(request, key, service = 'sole-cleanse-60') {
  const r = await request.get(`/api/availability/day?service=${service}&date=${key}`);
  return (await r.json()).slots.map((s) => s.label);
}

async function fillDetails(page) {
  await page.getByLabel('Street address').fill('1 Main St, Boston MA');
  await page.getByLabel('Full name').fill('Ada Tester');
  await page.getByLabel('Email').fill('ada@example.com');
  await page.getByLabel('Mobile phone').fill('617-555-0100');
  await page.getByLabel('I agree to the reservation policies').check();
}

async function pickFirstSlot(page) {
  for (let i = 0; i < 3; i += 1) {
    await expect(page.getByText('Checking the calendar…')).toHaveCount(0);
    const open = page.locator('.cal-day:not([disabled])');
    if (await open.count()) {
      await open.first().click();
      await page.locator('.slot').first().click();
      return;
    }
    await page.getByRole('button', { name: 'Next month' }).click();
  }
  throw new Error('No open days found');
}

async function payDemo(page) {
  await expect(page).toHaveURL(/\/demo-pay\/booking\//);
  await page.getByRole('button', { name: 'Complete test payment' }).click();
  await expect(page).toHaveURL(/\/booking\//);
}

test.describe('calendar blocking', () => {
  test('block a whole day, see it on the calendar, then remove it', async ({ page, request }, testInfo) => {
    const { key, date } = futureTuesday(testInfo);
    expect(await slotLabels(request, key)).toContain('11:30 AM');
    await signIn(page);
    const cell = await openAdminDay(page, date);
    await page.getByRole('button', { name: 'Block this day' }).click();
    await expect(page.locator('.block-row')).toContainText('Blocked all day');
    await expect(cell).toContainText('Blocked');
    await expect(page.getByRole('button', { name: 'Block this day' })).toHaveCount(0);
    expect(await slotLabels(request, key)).toEqual([]);

    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Remove block' }).click();
    await expect(page.locator('.block-row')).toHaveCount(0);
    expect(await slotLabels(request, key)).toContain('11:30 AM');
  });

  test('block part of a day every week until an end date', async ({ page, request }, testInfo) => {
    const { key, date } = futureTuesday(testInfo);
    const next = futureTuesday(testInfo, 1).key;
    const after = futureTuesday(testInfo, 2).key;
    await signIn(page);
    await openAdminDay(page, date);
    await page.getByRole('button', { name: 'Block part of this day' }).click();
    const form = page.locator('form', { has: page.getByRole('heading', { name: 'Block part of this day' }) });
    await form.getByLabel('From').fill('13:00');
    await form.getByLabel('To').fill('15:00');
    await form.getByLabel('Reason (optional, only you see this)').fill('Class');
    await form.getByLabel('Repeat every Tuesday').check();
    await form.getByLabel(/^Until/).fill(next);
    await form.getByRole('button', { name: 'Block every Tuesday' }).click();

    await expect(page.locator('.block-row')).toContainText('Blocked 1:00 PM to 3:00 PM');
    await expect(page.locator('.block-row')).toContainText('every Tuesday');
    for (const day of [key, next]) {
      const left = await slotLabels(request, day);
      expect(left).toContain('12:00 PM');
      expect(left).not.toContain('1:00 PM');
    }
    expect(await slotLabels(request, after)).toContain('1:00 PM'); // past the end date

    await adminTab(page, 'Hours and time off');
    const row = page.locator('.plain li', { hasText: 'Every Tuesday, 1:00 PM to 3:00 PM' });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Remove' }).click();
    await expect(row).toHaveCount(0);
    expect(await slotLabels(request, key)).toContain('1:00 PM');
  });

  test('blocking over a confirmed appointment warns and keeps it', async ({ page, request }, testInfo) => {
    const { key, date } = futureTuesday(testInfo, 3);
    const [slot] = (await (await request.get(`/api/availability/day?service=sole-cleanse-60&date=${key}`)).json()).slots;
    const booking = await request.post('/api/bookings', {
      data: { service: 'sole-cleanse-60', start_at: slot.start_at, name: 'Blocky Client', email: 'blocky@example.com', phone: '617-555-0199',
        location_type: 'home', address: '9 Elm St, Quincy MA', agreed_policy: true, addon_ids: [] },
    });
    const { token } = await booking.json();
    await request.post(`/api/demo/pay/booking/${token}`);

    await signIn(page);
    await openAdminDay(page, date);
    await page.getByRole('button', { name: 'Block this day' }).click();
    const warning = page.locator('.warn-box');
    await expect(warning).toContainText('overlaps 1 confirmed appointment');
    await expect(warning).toContainText('Blocky Client');
    await expect(page.locator('.agenda', { hasText: 'Blocky Client' })).toContainText('Confirmed');
    expect((await (await request.get(`/api/bookings/${token}`)).json()).status).toBe('confirmed');

    // Clean up
    const api = await adminApi(request);
    const cal = await (await api.get(`/api/admin/calendar?month=${key.slice(0, 7)}`)).json();
    for (const b of cal.blocks.filter((x) => x.local_date === key)) await api.delete(`/api/admin/time-off/${b.id}`);
    const mine = cal.bookings.find((b) => b.token === token);
    await api.patch(`/api/admin/bookings/${mine.id}`, { data: { status: 'cancelled' } });
  });
});

test.describe('weekly special', () => {
  test.afterEach(async ({ request }) => {
    const api = await adminApi(request);
    const { specials } = await (await api.get('/api/admin/specials')).json();
    for (const sp of specials) await api.delete(`/api/admin/specials/${sp.id}`);
  });

  test('Kerimah creates a special; clients see it and get the discount', async ({ page }) => {
    await signIn(page);
    await adminTab(page, 'Specials');
    await page.getByLabel('Title').fill('Fall special');
    await page.getByLabel('Description (shown in the banner)').fill('Treat your feet this week.');
    await page.getByLabel('Sole Cleanse, 60 minutes').check();
    await page.getByLabel('Percent off', { exact: true }).fill('10');
    await page.getByRole('button', { name: 'Save special' }).click();
    await expect(page.getByRole('status')).toHaveText('Special saved.');
    await expect(page.locator('.special-row')).toContainText('On now');

    // Only one at a time
    await page.getByLabel('Title').fill('Overlapping special');
    await page.getByLabel('Sole Cleanse, 90 minutes').check();
    await page.getByLabel('Percent off', { exact: true }).fill('5');
    await page.getByRole('button', { name: 'Save special' }).click();
    await expect(page.getByRole('alert')).toContainText('Only one special can run at a time');

    await page.goto('/');
    const banner = page.getByRole('complementary', { name: 'Special' });
    await expect(banner).toContainText('Fall special');
    await expect(banner).toContainText('Treat your feet this week.');
    await expect(banner).toContainText('10% off');

    await page.goto('/services');
    await expect(page.getByRole('complementary', { name: 'Special' })).toContainText('Fall special');
    const sixty = page.locator('#sole-cleanse li', { hasText: '60 minutes' });
    await expect(sixty.locator('s')).toHaveText('$190');
    await expect(sixty.locator('.sale')).toHaveText('$171');
    await expect(page.locator('#sole-cleanse li', { hasText: '90 minutes' }).locator('s')).toHaveCount(0);

    await page.goto('/book?service=sole-cleanse-60');
    const summary = page.locator('.summary');
    await expect(summary).toContainText('Regular price$190');
    await expect(summary).toContainText('Fall special (10% off)−$19');
    await expect(summary).toContainText('Total$171');
    await expect(summary).toContainText('Deposit today$75');
    await expect(summary).toContainText('Due at appointment$96');
    await pickFirstSlot(page);
    await fillDetails(page);
    await page.getByRole('button', { name: 'Pay $75 deposit' }).click();
    await payDemo(page);

    const receipt = page.locator('.receipt');
    await expect(receipt).toContainText('Regular price$190');
    await expect(receipt).toContainText('Fall special (10% off)−$19');
    await expect(receipt).toContainText('Total$171');
    await expect(receipt).toContainText('Deposit paid$75');
    await expect(receipt).toContainText('Due at appointment$96');
    await page.getByRole('button', { name: 'Cancel appointment' }).click();
    await page.locator('.panel').getByRole('button', { name: 'Cancel appointment' }).click();
  });
});

test.describe('corporate program', () => {
  test.afterEach(async ({ request }) => {
    const api = await adminApi(request);
    await api.put('/api/admin/settings', { data: { corporate_enabled: '0', corporate_description: '' } });
  });

  test('hidden until she turns it on; a code discounts an event booking', async ({ page, request }) => {
    await page.goto('/services');
    await expect(page.getByRole('heading', { name: 'Corporate clients' })).toHaveCount(0);

    await signIn(page);
    await adminTab(page, 'Corporate clients');
    await expect(page.getByText('The program is off')).toBeVisible();
    await page.getByLabel('Company name').fill('Acme Health');
    await page.getByLabel('Contact name').fill('Pat Lee');
    await page.getByLabel('Contact email').fill('pat@acme.example');
    await page.getByRole('button', { name: 'Add company' }).click();
    const added = page.getByRole('status');
    await expect(added).toContainText('Acme Health added. Their corporate code is');
    const code = (await added.textContent()).match(/code is (\S+)\./)[1];

    await adminTab(page, 'Settings');
    await page.getByLabel('Turn on the corporate program').check();
    await page.getByLabel(/^Program description/).fill('Her words about the corporate program.');
    await page.getByRole('textbox', { name: 'Percent off every event' }).fill('10');
    await page.getByRole('button', { name: 'Save program' }).click();
    await expect(page.getByRole('button', { name: 'Settings saved' }).first()).toBeVisible();

    await page.goto('/services');
    await expect(page.locator('.corporate-note')).toContainText('Her words about the corporate program.');

    // Massage bookings have no code field
    await page.goto('/book?service=sole-cleanse-60');
    await expect(page.locator('.summary')).toContainText('Total');
    await expect(page.getByLabel('Corporate code (optional)')).toHaveCount(0);

    await page.goto('/book?service=foot-loose');
    const codeField = page.getByLabel('Corporate code (optional)');
    await codeField.fill('WRONG-CODE');
    await page.getByRole('button', { name: 'Apply code' }).click();
    await expect(page.locator('#corporate-code-help')).toContainText("That corporate code isn't valid");
    await codeField.fill(code.toLowerCase());
    await page.getByRole('button', { name: 'Apply code' }).click();
    await expect(page.locator('#corporate-code-help')).toHaveText('Code applied for Acme Health.');
    const summary = page.locator('.summary');
    await expect(summary).toContainText('Regular price$570');
    await expect(summary).toContainText('Corporate rate (10% off)−$57');
    await expect(summary).toContainText('Total$513');
    await expect(summary).toContainText('Deposit today$75');

    await pickFirstSlot(page);
    await page.getByLabel('My workplace or event venue').check();
    await fillDetails(page);
    await page.getByRole('button', { name: 'Pay $75 deposit' }).click();
    await payDemo(page);
    await expect(page.locator('.receipt')).toContainText('Corporate rate (10% off)−$57');
    await expect(page.locator('.receipt')).toContainText('Due at appointment$438');
    const token = page.url().split('/booking/')[1];

    await page.goto('/admin/corporate');
    const card = page.locator('.company', { hasText: code });
    await expect(card).toContainText('1 event booked, 1 upcoming');
    await card.getByRole('button', { name: 'Show booking history' }).click();
    await expect(card.locator('.history')).toContainText('Corporate rate (10% off): −$57');

    // Clean up the booking
    await request.post(`/api/bookings/${token}/cancel`);
  });
});
