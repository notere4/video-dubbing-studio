import { startRuntime, expect } from '/home/user/oss-new/control/runtime/index.mjs';
import { fakeAi, createProject, waitForStatus } from './helpers.mjs';

const runtime = await startRuntime(fakeAi);
try {
  const context = await runtime.context('owner');
  const page = await context.newPage();

  // F005: the terminology dictionary.
  await page.goto('/dictionary');
  await runtime.assertBackLink(page);
  await page.getByTestId('term-source').fill('sourdough');
  await page.getByTestId('term-lang').click();
  await page.getByRole('option', { name: 'Spanish', exact: true }).click();
  await page.getByTestId('term-translation').fill('masa madre');
  await page.getByTestId('add-term').click();
  await expect(page.getByTestId('term-row')).toHaveCount(1);
  await expect(page.getByTestId('term-row').first()).toContainText('masa madre');
  // Add, edit and delete a second entry.
  await page.getByTestId('term-source').fill('Crumb');
  await page.getByTestId('term-lang').click();
  await page.getByRole('option', { name: 'Spanish', exact: true }).click();
  await page.getByTestId('term-keep').check();
  await page.getByTestId('add-term').click();
  await expect(page.getByTestId('term-row')).toHaveCount(2);
  const crumb = page.getByTestId('term-row').filter({ hasText: 'Crumb' });
  await expect(crumb).toContainText('Keep as is');
  await crumb.getByTestId('term-edit').click();
  await page.getByTestId('edit-term-source').fill('Crust');
  await page.getByTestId('save-term').click();
  await expect(page.getByTestId('term-row').filter({ hasText: 'Crust' })).toHaveCount(1);
  await page.getByTestId('term-row').filter({ hasText: 'Crust' }).getByTestId('term-delete').click();
  await page.getByTestId('confirm').click();
  await expect(page.getByTestId('term-row')).toHaveCount(1);

  // F001 + F002: a failed run shows the error and recovers with Retry; delete removes it.
  const failingId = await createProject(page, { name: 'Interview cut', source: 'German', targets: ['en'] });
  await waitForStatus(page, 'Failed');
  await expect(page.getByTestId('project-error')).toBeVisible();
  await page.getByTestId('retry').click();
  await waitForStatus(page, 'Ready for review');
  await page.goto('/');
  const row = page.getByTestId('project-row').filter({ hasText: 'Interview cut' });
  await expect(row).toContainText('German');
  await row.getByTestId('project-actions').click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByTestId('confirm').click();
  await expect(page.getByTestId('project-row').filter({ hasText: 'Interview cut' })).toHaveCount(0);
  const db = await runtime.database();
  const left = await db.prepare('select count(*) as n from segments where project_id = ?').bind(failingId).first();
  expect(left.n).toBe(0);
  expect((await runtime.fetch(`/api/projects/${failingId}/media`, { role: 'owner' })).status).toBe(404);

  // F001: upload, background processing, list with languages, duration and status.
  const id = await createProject(page, { name: 'Sourdough basics', targets: ['es'] });
  await waitForStatus(page, 'Ready for review');
  const media = await runtime.fetch(`/api/projects/${id}/media`, { role: 'owner', headers: { range: 'bytes=0-99' } });
  expect(media.status).toBe(206);
  await page.goto('/');
  const main = page.getByTestId('project-row').filter({ hasText: 'Sourdough basics' });
  await expect(main).toContainText('English');
  await expect(main).toContainText('Spanish');
  await expect(main).toContainText('0:06');
  await expect(main.getByTestId('project-status')).toHaveText('Ready for review');
  // Rename.
  await main.getByTestId('project-actions').click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  await page.getByTestId('rename-input').fill('Sourdough basics, Spanish');
  await page.getByTestId('rename-save').click();
  await expect(page.getByTestId('project-row').filter({ hasText: 'Sourdough basics, Spanish' })).toHaveCount(1);

  // F002 + F003: timed segments with translations that follow the dictionary.
  await page.goto(`/projects/${id}`);
  const segments = page.getByTestId('segment');
  await expect(segments).toHaveCount(3);
  await expect(segments.nth(1).getByTestId('segment-translation')).toHaveValue('Hoy horneamos pan de masa madre desde cero.');
  await expect(segments.nth(0).getByTestId('segment-start')).toHaveValue('00:00.000');
  await expect(segments.nth(0).getByTestId('segment-speaker')).toHaveValue('Speaker 1');
  // The player seeks to a segment.
  await segments.nth(2).getByTestId('segment-seek').click();
  await expect.poll(() => page.getByTestId('preview-video').evaluate(v => v.currentTime)).toBeGreaterThanOrEqual(3.9);

  // Edits are saved.
  await segments.nth(0).getByTestId('segment-translation').fill('Bienvenidos otra vez a la panaderia.');
  await segments.nth(0).getByTestId('segment-end').fill('00:01.900');
  await segments.nth(0).getByTestId('segment-speaker').fill('Ana');
  await Promise.all([page.waitForResponse(r => r.url().includes('_serverFn') && r.request().method() === 'POST'), segments.nth(0).getByTestId('segment-save').click()]);
  await page.reload();
  await expect(segments.nth(0).getByTestId('segment-translation')).toHaveValue('Bienvenidos otra vez a la panaderia.');
  await expect(segments.nth(0).getByTestId('segment-end')).toHaveValue('00:01.900');
  await expect(segments.nth(0).getByTestId('segment-speaker')).toHaveValue('Ana');

  // Re-translate one segment and the whole track.
  await segments.nth(0).getByTestId('segment-retranslate').click();
  await expect(segments.nth(0).getByTestId('segment-translation')).toHaveValue('Bienvenidos de nuevo a la panaderia.');
  await page.getByTestId('retranslate-track').click();
  await page.getByTestId('confirm').click();
  await expect(segments.nth(2).getByTestId('segment-translation')).toHaveValue('Deja reposar la masa una hora.', { timeout: 30000 });

  // Speaker voice and speed.
  const ana = page.getByTestId('speaker').filter({ hasText: 'Ana' });
  await ana.getByTestId('speaker-speed').fill('1.1');
  await ana.getByTestId('speaker-speed').blur();
  await expect(page.getByTestId('voice-cloning-off')).toBeVisible();

  // F005: subtitles out, subtitles on the preview, and an SRT in.
  const srt = await runtime.fetch(`/api/projects/${id}/subtitles/es?format=srt`, { role: 'owner' });
  expect(srt.status).toBe(200);
  const srtText = await srt.text();
  expect(srtText).toContain('00:00:00,000 --> 00:00:01,900');
  expect(srtText).toContain('masa madre');
  const vtt = await (await runtime.fetch(`/api/projects/${id}/subtitles/es?format=vtt`, { role: 'owner' })).text();
  expect(vtt.startsWith('WEBVTT')).toBe(true);
  expect(vtt).toContain('00:00:02.000 --> 00:00:03.800');
  const original = await (await runtime.fetch(`/api/projects/${id}/subtitles/source?format=srt`, { role: 'owner' })).text();
  expect(original).toContain('Let the dough rest for an hour.');
  await page.getByTestId('captions-toggle').click();
  await expect(page.locator('[data-testid="preview-video"] track')).toHaveCount(1);
  await segments.nth(0).getByTestId('segment-seek').click();
  await expect(page.getByTestId('caption-line')).toHaveText('Bienvenidos de nuevo a la panaderia.');
  await page.getByTestId('preview-video').evaluate(v => v.pause());
  const upload = '1\n00:00:00,500 --> 00:00:02,500\nHola y bienvenidos a la panaderia.\n\n2\n00:00:03,000 --> 00:00:05,500\nHoy horneamos pan de masa madre.\n';
  await page.getByTestId('srt-file').setInputFiles({ name: 'spanish.srt', mimeType: 'application/x-subrip', buffer: Buffer.from(upload) });
  await expect(segments).toHaveCount(2);
  await expect(segments.nth(0).getByTestId('segment-start')).toHaveValue('00:00.500');
  await expect(segments.nth(0).getByTestId('segment-translation')).toHaveValue('Hola y bienvenidos a la panaderia.');
  await expect(segments.nth(0).getByTestId('segment-source')).toHaveValue('Welcome back to the bakery.');

  // F004: dub, then re-dub only what changed.
  await expect(page.getByTestId('start-dub')).toHaveText('Dub Spanish');
  await page.getByTestId('start-dub').click();
  await expect(page.getByTestId('track-status')).toHaveText('Dubbed', { timeout: 60000 });
  const download = page.getByTestId('download-audio');
  await expect(download).toBeVisible({ timeout: 30000 });
  const href = await download.getAttribute('href');
  const audio = await runtime.fetch(href, { role: 'owner' });
  expect(audio.status).toBe(200);
  expect(audio.headers.get('content-type')).toContain('audio/wav');
  await page.getByTestId('dub-toggle').click();
  await expect(page.getByTestId('preview-video')).toHaveJSProperty('muted', true);
  await expect(page.getByTestId('needs-redub')).toHaveCount(0);
  const db2 = await runtime.database();
  const clipsBefore = await db2.prepare('select segment_id, clip_key from translations where project_id = ? and lang = ? order by segment_id').bind(id, 'es').all();
  await segments.nth(1).getByTestId('segment-translation').fill('Hoy horneamos pan de masa madre paso a paso.');
  await segments.nth(1).getByTestId('segment-save').click();
  await expect(segments.nth(1).getByTestId('needs-redub')).toBeVisible();
  await expect(page.getByTestId('needs-redub')).toHaveCount(1);
  await expect(page.getByTestId('start-dub')).toHaveText(/1 changed/);
  await page.getByTestId('start-dub').click();
  await expect(page.getByTestId('needs-redub')).toHaveCount(0, { timeout: 60000 });
  await expect(page.getByTestId('track-status')).toHaveText('Dubbed', { timeout: 60000 });
  await expect(page.getByTestId('download-audio')).toBeVisible({ timeout: 30000 });
  const clipsAfter = await db2.prepare('select segment_id, clip_key from translations where project_id = ? and lang = ? order by segment_id').bind(id, 'es').all();
  const changedClips = clipsAfter.results.filter((row, i) => row.clip_key !== clipsBefore.results[i].clip_key);
  expect(changedClips).toHaveLength(1);
  const redone = await (await runtime.fetch(`/api/projects/${id}/subtitles/es?format=srt`, { role: 'owner' })).text();
  expect(redone).toContain('paso a paso');

  await runtime.assertBackLink(page);
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 10000 });
  await page.getByTestId('track-status').evaluate(el => el.closest('section').scrollIntoView({ block: 'start' }));
  await runtime.screenshot(page);

  // Phone-sized smoke.
  const phone = await runtime.context('owner', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const small = await phone.newPage();
  await small.goto('/');
  await expect(small.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(small.getByTestId('project-row')).toHaveCount(1);
  const overflow = await small.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
} finally {
  await runtime.close();
}
