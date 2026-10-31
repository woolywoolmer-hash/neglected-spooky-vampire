import { test, expect } from '@playwright/test';
const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
test('calendar views, filters, 24-hour view and tablet layout render', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Booking calendar.' })).toBeVisible();
  await page.getByRole('button', { name: 'Day', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Show 24 hours' })).toBeVisible();
  await page.getByRole('button', { name: 'Show 24 hours' }).click();
  await expect(page.getByText('00:00', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Month', exact: true }).click();
  await expect(page.locator('.cal-month')).toBeVisible();
  await page.getByRole('button', { name: 'Year', exact: true }).click();
  await expect(page.locator('.cal-mini-month')).toHaveCount(12);
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await page.getByRole('button', { name: 'Jowett Hall', exact: true }).click();
  await expect(page.locator('.cal-chip.active')).toContainText(['Jowett Hall']);
  await page.setViewportSize({ width: 820, height: 1180 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/tablet-calendar.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('customer and off-hour booking persist, 90-minute price and conflict feedback work', async ({
  page,
}) => {
  const organisation = `Demo club ${unique()}`;
  const title = `Off-hour training ${unique()}`;
  await page.goto('/');
  await page.getByRole('button', { name: 'Customers', exact: true }).click();
  await page.getByRole('button', { name: 'Add customer' }).click();
  await page.getByRole('textbox', { name: 'Organisation *', exact: true }).fill(organisation);
  await page.getByRole('textbox', { name: 'Contact name', exact: true }).fill('Test Coach');
  await page.getByRole('button', { name: 'Save customer' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText(organisation, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await page.getByRole('button', { name: 'New booking', exact: true }).click();
  await page.getByLabel('Booking purpose', { exact: true }).fill(title);
  await page.getByLabel('Facility / resource').selectOption('jowett');
  await page.getByLabel('Customer record').selectOption({ label: organisation });
  await page.getByLabel('Start date', { exact: true }).fill('2031-05-12');
  await page.getByLabel('Start time', { exact: true }).fill('18:10');
  await page.getByLabel('End time', { exact: true }).fill('19:40');
  await expect(page.locator('.bd-price-total')).toContainText('£66.00');
  await page.getByRole('button', { name: 'Create booking', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Bookings', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search bookings' }).fill(title);
  await page.getByText(title, { exact: true }).click();
  await expect(page.getByLabel('Start time', { exact: true })).toHaveValue('18:10');
  await expect(page.getByLabel('End time', { exact: true })).toHaveValue('19:40');
  await page.getByLabel('Booking purpose', { exact: true }).fill(`${title} edited`);
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Bookings', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search bookings' }).fill(`${title} edited`);
  await expect(page.getByText(`${title} edited`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await page.getByRole('button', { name: 'New booking', exact: true }).click();
  await page.getByLabel('Booking purpose', { exact: true }).fill('Conflicting test booking');
  await page.getByLabel('Facility / resource').selectOption('jowett');
  await page.getByLabel('Start date', { exact: true }).fill('2031-05-12');
  await page.getByLabel('Start time', { exact: true }).fill('18:30');
  await page.getByRole('button', { name: 'Create booking', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('conflict');
});
test('server enforces Astro rules, recurrence atomicity, buffers and roles via real HTTP', async ({
  request,
}) => {
  const stamp = unique();
  const post = (booking: object) => request.post('/api/bookings', { data: { booking } });
  const base = {
    title: `API test ${stamp}`,
    start: '2032-08-12T17:15:00.000Z',
    end: '2032-08-12T18:15:00.000Z',
    status: 'Confirmed',
    type: 'External Hirer',
    paymentStatus: 'Unpaid',
    attendees: 12,
  };
  expect((await post({ ...base, facilityId: 'astro-a' })).ok()).toBeTruthy();
  expect((await post({ ...base, facilityId: 'astro-b' })).ok()).toBeTruthy();
  expect((await post({ ...base, facilityId: 'astro-full' })).status()).toBe(409);
  const all = await (await request.get('/api/data')).json();
  const original = all.bookings.length;
  const series = await post({
    ...base,
    facilityId: 'astro-full',
    start: '2032-08-05T17:15:00.000Z',
    end: '2032-08-05T18:15:00.000Z',
    recurrence: { frequency: 'weekly', interval: 1, weekdays: [], until: '', count: 2 },
  });
  expect(series.status()).toBe(409);
  expect((await (await request.get('/api/data')).json()).bookings.length).toBe(original);
  const f = all.facilities.find((f: { id: string }) => f.id === 'squash-2');
  expect(
    (
      await request.post('/api/settings', {
        data: { operation: 'save-facility', value: { ...f, bufferAfter: 5 } },
      })
    ).ok()
  ).toBeTruthy();
  const b = {
    ...base,
    facilityId: 'squash-2',
    start: '2032-08-13T18:00:00.000Z',
    end: '2032-08-13T19:00:00.000Z',
  };
  expect((await post(b)).ok()).toBeTruthy();
  expect(
    (
      await post({ ...b, start: '2032-08-13T19:00:00.000Z', end: '2032-08-13T20:00:00.000Z' })
    ).status()
  ).toBe(409);
  expect(
    (await post({ ...b, start: '2032-08-13T19:05:00.000Z', end: '2032-08-13T20:05:00.000Z' })).ok()
  ).toBeTruthy();
  await request.post('/api/settings', { data: { operation: 'save-facility', value: f } });
  await request.post('/api/session', { data: { role: 'readonly' } });
  expect((await post({ ...base, facilityId: 'jowett' })).status()).toBe(403);
  expect(
    (
      await request.post('/api/customers', { data: { customer: { organisation: 'Denied' } } })
    ).status()
  ).toBe(403);
  await request.post('/api/session', { data: { role: 'staff' } });
  expect((await post({ ...base, facilityId: 'jowett' })).status()).toBe(403);
  expect(
    (
      await post({ ...base, facilityId: 'jowett', type: 'School', status: 'Awaiting Approval' })
    ).ok()
  ).toBeTruthy();
  const staffData = await (await request.get('/api/data')).json();
  expect(staffData.customers).toEqual([]);
  expect(staffData.audit).toEqual([]);
  const own = staffData.bookings.find(
    (b: { createdById: string; title: string }) =>
      b.createdById === 'demo-staff' && b.title === base.title
  );
  await request.post('/api/session', { data: { role: 'manager' } });
  const directory = await (await request.get('/api/data')).json();
  expect((await post({ ...own, customerId: directory.customers[0].id })).ok()).toBeTruthy();
  await request.post('/api/session', { data: { role: 'staff' } });
  const ownLinked = (await (await request.get('/api/data')).json()).bookings.find(
    (b: { id: string }) => b.id === own.id
  );
  expect(
    (
      await post({
        ...ownLinked,
        status: 'Cancelled',
        cancellationReason: 'Staff cancellation with private customer link',
      })
    ).ok()
  ).toBeTruthy();
});
test('reports export CSV and readonly UI prevents writes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Reports', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export bookings', exact: true }).click();
  expect((await download).suggestedFilename()).toContain('.csv');
  await page.getByRole('tab', { name: 'By customer', exact: true }).click();
  await expect(page.locator('.rpt-detail table')).toBeVisible();
  await page.getByLabel('Demo role').selectOption('readonly');
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'New booking', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByText('Administrator access required')).toBeVisible();
});
test('recurring series saves atomically, individual cancellation and closure management work', async ({
  request,
}) => {
  const base = {
    facilityId: 'squash-1',
    title: `Weekly practice ${unique()}`,
    start: '2033-02-07T17:15:00.000Z',
    end: '2033-02-07T18:15:00.000Z',
    type: 'Sports Centre',
    status: 'Confirmed',
    paymentStatus: 'Unpaid',
    attendees: 2,
  };
  const created = await request.post('/api/bookings', {
    data: {
      booking: {
        ...base,
        recurrence: { frequency: 'weekly', interval: 1, weekdays: [], until: '', count: 3 },
      },
    },
  });
  expect(created.ok()).toBeTruthy();
  const series = (await created.json()).bookings;
  expect(series).toHaveLength(3);
  expect(new Set(series.map((b: { seriesId: string }) => b.seriesId)).size).toBe(1);
  let data = await (await request.get('/api/data')).json();
  const one = data.bookings.find((b: { id: string }) => b.id === series[1].id);
  expect(
    (
      await request.post('/api/bookings', {
        data: {
          booking: {
            ...one,
            status: 'Cancelled',
            cancellationReason: 'Test individual cancellation',
          },
        },
      })
    ).ok()
  ).toBeTruthy();
  data = await (await request.get('/api/data')).json();
  expect(
    data.bookings.filter(
      (b: { seriesId: string; status: string }) =>
        b.seriesId === one.seriesId && b.status === 'Confirmed'
    )
  ).toHaveLength(2);
  const saved = await request.post('/api/settings', {
    data: {
      operation: 'save-closure',
      value: {
        facilityId: 'squash-1',
        start: '2033-02-14T17:00:00.000Z',
        end: '2033-02-14T19:00:00.000Z',
        reason: 'Maintenance',
        notes: 'Test inspection',
      },
    },
  });
  expect(saved.ok()).toBeTruthy();
  const closure = await saved.json();
  const refused = await request.post('/api/bookings', {
    data: {
      booking: { ...base, start: '2033-02-14T17:15:00.000Z', end: '2033-02-14T18:15:00.000Z' },
    },
  });
  expect(refused.status()).toBe(409);
  data = await (await request.get('/api/data')).json();
  const c = data.closures.find((c: { notes: string }) => c.notes === 'Test inspection');
  expect(c).toBeTruthy();
  expect(
    (
      await request.post('/api/settings', {
        data: { operation: 'delete-closure', value: { id: c.id } },
      })
    ).ok()
  ).toBeTruthy();
  expect(
    data.audit.some(
      (a: { entityId: string; reason: string }) =>
        a.entityId === one.id && a.reason === 'Test individual cancellation'
    )
  ).toBeTruthy();
});
