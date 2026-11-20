import { startRuntime, expect } from '/home/user/oss-new/control/runtime/index.mjs';
import { fakeAi, createProject, waitForStatus } from './helpers.mjs';

const runtime = await startRuntime(fakeAi);
try {
  let page = await (await runtime.context('owner')).newPage();
  await page.goto('/dictionary');
  await page.getByTestId('term-source').fill('starter');
  await page.getByTestId('term-lang').click();
  await page.getByRole('option', { name: 'Spanish', exact: true }).click();
  await page.getByTestId('term-translation').fill('masa madre');
  await page.getByTestId('add-term').click();
  await expect(page.getByTestId('term-row')).toHaveCount(1);
  const id = await createProject(page, { name: 'Market day recap' });
  await waitForStatus(page, 'Ready for review');
  const segment = page.getByTestId('segment').nth(2);
  await segment.getByTestId('segment-translation').fill('Deja reposar la masa toda la noche.');
  await segment.getByTestId('segment-save').click();
  await expect(page.getByText('Saved')).toBeVisible();

  await runtime.restart();

  page = await (await runtime.context('owner')).newPage();
  await page.goto('/');
  await expect(page.getByTestId('project-row').filter({ hasText: 'Market day recap' })).toHaveCount(1);
  await page.goto(`/projects/${id}`);
  await expect(page.getByTestId('segment')).toHaveCount(3);
  await expect(page.getByTestId('segment').nth(2).getByTestId('segment-translation')).toHaveValue('Deja reposar la masa toda la noche.');
  const media = await runtime.fetch(`/api/projects/${id}/media`, { role: 'owner' });
  expect(media.status).toBe(200);
  expect((await media.arrayBuffer()).byteLength).toBeGreaterThan(1000);
  await page.goto('/dictionary');
  await expect(page.getByTestId('term-row')).toContainText('masa madre');
} finally {
  await runtime.close();
}
