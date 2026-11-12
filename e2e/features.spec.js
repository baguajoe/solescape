import { expect, test } from '@playwright/test';

// Calendar blocking, Weekly Deals, her wording and the corporate program, clicked through as Kerimah and as a client.
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

async function fillDetails(page, area = 'Other') {
  if (area) await page.getByLabel(area, { exact: true }).check();
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
        location_type: 'home', address: '9 Elm St, Quincy MA', area: 'other', agreed_policy: true, addon_ids: [] },
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

/** Clicks the first open day matching `selector` (this month or the next two), then its first time. */
async function pickDay(page, selector) {
  for (let i = 0; i < 3; i += 1) {
    await expect(page.getByText('Checking the calendar…')).toHaveCount(0);
    const days = page.locator(selector);
    if (await days.count()) {
      const label = await days.first().getAttribute('aria-label');
      await days.first().click();
      await page.locator('.slot').first().click();
      return label;
    }
    await page.getByRole('button', { name: 'Next month' }).click();
  }
  throw new Error(`No open day matching ${selector}`);
}

const HER_DEAL = 'Weekly Deals: Mondays South Coast; Wednesdays Boston. $30 off 60-minute & 90-minute sessions. Not available for Recovery Lounge or Foot Loose services.';
const HER_INTRO = 'SoleScape Foot Spa & Massage delivers mobile therapeutic foot care to restore movement, relieve chronic pain, and prevent injuries—right where you are.';

test.describe('her wording', () => {
  test('new hero, travels-to-you tagline, Foot Loose and Mama\'s Sole Relief text', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('A complete sole to soul recovery experience.');
    await expect(page.locator('.hero-lead')).toHaveText(HER_INTRO);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', HER_INTRO);
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', `A complete sole to soul recovery experience. ${HER_INTRO}`);
    // Tagline sits under the paragraph and above the buttons; How it works is unchanged
    const tagline = page.locator('.hero .tagline');
    await expect(tagline).toHaveText('She travels to you');
    const order = await page.locator('.hero-copy > *').evaluateAll((els) => els.map((e) => e.className));
    expect(order.slice(0, 4)).toEqual(['', 'hero-lead', 'tagline', 'row']);
    await expect(page.getByRole('heading', { name: 'She comes to you' })).toBeVisible();

    // Service descriptions also show on the Home cards and the booking page
    for (const name of ['Foot Loose', 'Recovery Lounge']) {
      await expect(page.locator('.teaser', { hasText: name })).not.toContainText('Convenient for corporate events');
    }
    await expect(page.locator('.teaser', { hasText: 'Foot Loose' })).toContainText('Foot massages for overworked feet, reducing chronic tension throughout your body + improving posture.');
    await page.goto('/book?service=mamas-sole-relief-60');
    await expect(page.locator('.choice', { hasText: '60 minutes' }).filter({ hasText: 'weight-bearing' })).toContainText('45-minute full-body massage alleviating weight-bearing joints');

    await page.goto('/services');
    await expect(page.locator('#foot-loose li')).toContainText('Foot massages for overworked feet, reducing chronic tension throughout your body + improving posture.');
    await expect(page.locator('#recovery-lounge li')).toContainText('Therapeutic 15-minute or 20-minute massages in a specialized chair, fully clothed, improving mobility within your scalp, neck, back & shoulders.');
    await expect(page.locator('#events li')).not.toContainText(['Convenient for corporate events']);
    // The sentence appears once on the page, as the Events intro
    await expect(page.locator('#events > p').first()).toHaveText('Convenient for corporate events, community events, and special events.');
    await expect(page.getByText('Convenient for corporate events, community events, and special events.')).toHaveCount(1);
    await page.getByText('Where are services held?').click();
    await expect(page.locator('details', { hasText: 'Where are services held?' }).locator('p')).toHaveText('At your home or workplace, from Boston to the South Coast of Massachusetts.');
    await expect(page.getByText('Where do you come?')).toHaveCount(0);

    await expect(page.locator('#mama-s-sole-relief li', { hasText: '60 minutes' })).toContainText('45-minute full-body massage alleviating weight-bearing joints, light to firm pressure + 15-min foot massage, hot towels.');

    // Booking page uses the same descriptions
    await page.goto('/book?service=recovery-lounge');
    const lounge = page.locator('fieldset.choice-group', { has: page.locator('legend', { hasText: 'Recovery Lounge' }) });
    await expect(lounge.locator('.choice small')).toHaveText('Therapeutic 15-minute or 20-minute massages in a specialized chair, fully clothed, improving mobility within your scalp, neck, back & shoulders.');
    const foot = page.locator('fieldset.choice-group', { has: page.locator('legend', { hasText: 'Foot Loose' }) });
    await expect(foot.locator('.choice small')).toHaveText('Foot massages for overworked feet, reducing chronic tension throughout your body + improving posture.');
  });
});

test.describe('Weekly Deals', () => {
  test.afterEach(async ({ request }) => {
    const api = await adminApi(request);
    await api.put('/api/admin/settings', { data: { weekly_deal_enabled: '1', weekly_deal_dollars: '30', weekly_deal_south_coast_day: '0', weekly_deal_boston_day: '2' } });
  });

  test('banner on Home and Services; calendar tags follow service and area', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('complementary', { name: 'Weekly Deals' })).toHaveText(HER_DEAL);
    await page.goto('/services');
    await expect(page.getByRole('complementary', { name: 'Weekly Deals' })).toHaveText(HER_DEAL);

    await page.goto('/book?service=sole-cleanse-60');
    await expect(page.getByText('Checking the calendar…')).toHaveCount(0);
    await expect(page.locator('.deal-tag')).toHaveCount(0); // no area chosen yet
    await page.getByLabel('South Coast', { exact: true }).check();
    await expect(page.locator('.cal-day.deal').first()).toBeVisible();
    for (const label of await page.locator('.cal-day.deal').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))) {
      expect(label).toMatch(/^Monday, .*Weekly Deal \$30 off$/);
    }
    await expect(page.locator('.cal-day.deal .deal-tag').first()).toHaveText('$30 off');
    await page.getByLabel('Boston area', { exact: true }).check();
    for (const label of await page.locator('.cal-day.deal').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))) {
      expect(label).toMatch(/^Wednesday, /);
    }
    await page.getByLabel('Other', { exact: true }).check();
    await expect(page.locator('.cal-day.deal')).toHaveCount(0);

    // Not for the 120-minute session or events
    await page.goto('/book?service=sole-cleanse-120');
    await page.getByLabel('South Coast', { exact: true }).check();
    await expect(page.getByText('Checking the calendar…')).toHaveCount(0);
    await expect(page.locator('.cal-day.deal')).toHaveCount(0);
    await page.goto('/book?service=foot-loose');
    await page.getByLabel('Boston area', { exact: true }).check();
    await expect(page.getByText('Checking the calendar…')).toHaveCount(0);
    await expect(page.locator('.cal-day.deal')).toHaveCount(0);
  });

  test('book a deal day, see it everywhere, reschedule off it and see the new total first', async ({ page }) => {
    await page.goto('/book?service=sole-cleanse-60');
    await page.getByLabel('South Coast', { exact: true }).check();
    const dayLabel = await pickDay(page, '.cal-day.deal:not([disabled])');
    const summary = page.locator('.summary');
    await expect(summary).toContainText('Regular price$190');
    await expect(summary).toContainText('Weekly Deal−$30');
    await expect(summary).toContainText('Total$160');
    await expect(summary).toContainText('Deposit today$75');
    await expect(summary).toContainText('Due at appointment$85');
    await expect(summary).toContainText('Area: South Coast');
    await fillDetails(page, null);
    await page.getByRole('button', { name: 'Pay $75 deposit' }).click();
    await payDemo(page);

    const receipt = page.locator('.receipt').first();
    await expect(receipt).toContainText('Regular price$190');
    await expect(receipt).toContainText('Weekly Deal−$30');
    await expect(receipt).toContainText('Total$160');
    await expect(receipt).toContainText('Deposit paid$75');
    await expect(receipt).toContainText('Due at appointment$85');
    await expect(receipt).toContainText('Area: South Coast');
    const token = page.url().split('/booking/')[1];

    // Kerimah sees the area in her calendar
    const admin = await page.context().newPage();
    await signIn(admin);
    const [, monthDay] = dayLabel.match(/^\w+, (\w+ \d+)/);
    const year = new Date().getFullYear();
    let date = new Date(`${monthDay}, ${year} 12:00`);
    if (date < new Date(Date.now() - 86400000)) date = new Date(`${monthDay}, ${year + 1} 12:00`);
    await openAdminDay(admin, date);
    const card = admin.locator('.agenda', { hasText: 'Ada Tester' }).first();
    await expect(card).toContainText('Area: South Coast');
    await expect(card).toContainText('Weekly Deal');
    await admin.close();

    // Reschedule to a day without the deal: the new total shows before confirming
    await page.getByRole('button', { name: 'Reschedule' }).click();
    await pickDay(page, '.panel .cal-day:not([disabled]):not(.deal)');
    const preview = page.locator('.new-total');
    await expect(preview).toContainText('Your new total');
    await expect(preview).toContainText('from $160 to $190');
    await expect(preview).toContainText('Total$190');
    await expect(preview).toContainText('Due at appointment$115');
    await page.getByRole('button', { name: /^Move to/ }).click();
    await expect(page.getByRole('status')).toContainText('has been moved');
    await expect(page.locator('.receipt')).toContainText('Total$190');
    await expect(page.locator('.receipt')).not.toContainText('Weekly Deal');

    await page.request.post(`/api/bookings/${token}/cancel`);
  });

  test('Kerimah turns Weekly Deals off and changes the amount in Settings', async ({ page }) => {
    await signIn(page);
    await adminTab(page, 'Settings');
    const panel = page.locator('form', { has: page.getByRole('heading', { name: 'Weekly Deals' }) });
    await expect(panel.getByLabel('South Coast day')).toHaveValue('0');
    await expect(panel.getByLabel('Boston area day')).toHaveValue('2');
    await panel.getByLabel('Dollars off').fill('25');
    await panel.getByRole('button', { name: 'Save Weekly Deals' }).click();
    await expect(panel.getByRole('button', { name: 'Settings saved' })).toBeVisible();
    await page.goto('/');
    await expect(page.getByRole('complementary', { name: 'Weekly Deals' })).toContainText('$25 off 60-minute & 90-minute sessions.');

    await page.goto('/admin/settings');
    await panel.getByLabel('Turn on Weekly Deals').uncheck();
    await panel.getByRole('button', { name: 'Save Weekly Deals' }).click();
    await expect(panel.getByRole('button', { name: 'Settings saved' })).toBeVisible();
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Weekly Deals' })).toHaveCount(0);
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
