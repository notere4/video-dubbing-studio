import { startRuntime, expect } from '/home/user/oss-new/control/runtime/index.mjs';
import { fakeAi, createProject, waitForStatus } from './helpers.mjs';

const runtime = await startRuntime(fakeAi);
try {
  // Anonymous and outsider are refused on member pages.
  await runtime.assertPrivateAccess(['/', '/dictionary']);

  const ownerPage = await (await runtime.context('owner')).newPage();
  const ownerProject = await createProject(ownerPage, { name: 'Owner launch video' });
  await waitForStatus(ownerPage, 'Ready for review');
  await ownerPage.goto('/dictionary');
  await ownerPage.getByTestId('term-source').fill('launch');
  await ownerPage.getByTestId('term-lang').click();
  await ownerPage.getByRole('option', { name: 'Spanish', exact: true }).click();
  await ownerPage.getByTestId('term-translation').fill('lanzamiento');
  await ownerPage.getByTestId('add-term').click();
  await expect(ownerPage.getByTestId('term-row')).toHaveCount(1);

  const memberPage = await (await runtime.context('member')).newPage();
  const memberProject = await createProject(memberPage, { name: 'Member onboarding clip' });
  await waitForStatus(memberPage, 'Ready for review');

  const privatePaths = (id) => [
    `/projects/${id}`,
    `/api/projects/${id}/media`,
    `/api/projects/${id}/subtitles/es?format=srt`,
    `/api/projects/${id}/subtitles/source?format=vtt`,
    `/api/projects/${id}/tracks/es`,
  ];

  // Anonymous and outsider are refused on every private API path.
  for (const path of privatePaths(ownerProject)) {
    for (const role of [undefined, 'outsider']) {
      const response = await runtime.fetch(path, role ? { role } : {});
      expect([401, 403, 302, 303]).toContain(response.status);
    }
  }

  // One member never reads another's project, admin or not.
  for (const [role, id, name] of [['member', ownerProject, 'Owner launch video'], ['owner', memberProject, 'Member onboarding clip']]) {
    for (const path of privatePaths(id)) {
      const response = await runtime.fetch(path, { role });
      expect(response.status, `${role} ${path}`).toBe(404);
      expect(await response.text()).not.toContain(name);
    }
    // ...nor changes it.
    for (const [method, path] of [['PUT', `/api/projects/${id}/media`], ['PUT', `/api/projects/${id}/audio/0`], ['PUT', `/api/projects/${id}/tracks/es?revision=1`]]) {
      const response = await runtime.fetch(path, { role, method, headers: { 'content-type': 'audio/wav' }, body: new Uint8Array(64) });
      expect(response.status, `${role} ${method} ${path}`).toBe(404);
    }
  }
  // Lists and dictionaries are per member.
  await memberPage.goto('/');
  await expect(memberPage.getByTestId('project-row')).toHaveCount(1);
  await expect(memberPage.getByText('Owner launch video')).toHaveCount(0);
  await memberPage.goto('/dictionary');
  await expect(memberPage.getByTestId('term-row')).toHaveCount(0);
  await ownerPage.goto('/');
  await expect(ownerPage.getByText('Member onboarding clip')).toHaveCount(0);

  // The owner's files are untouched by the member's attempts.
  const media = await runtime.fetch(`/api/projects/${ownerProject}/media`, { role: 'owner' });
  expect(media.status).toBe(200);
  expect((await media.arrayBuffer()).byteLength).toBeGreaterThan(1000);

  // No admin-only actions exist: each object belongs to its member alone.
  // The app serves no sign-in of its own.
  for (const path of ['/login', '/signin', '/sign-in', '/signup', '/register', '/logout']) {
    const response = await runtime.fetch(path, { role: 'member' });
    expect(response.status, path).toBe(404);
  }
  await memberPage.goto('/');
  await expect(memberPage.locator('input[type="password"]')).toHaveCount(0);
} finally {
  await runtime.close();
}
