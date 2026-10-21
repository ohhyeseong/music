import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('duplicate evidence sources produce one genre chip without React key collisions', async ({
  page,
}) => {
  const duplicateErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('same key'))
      duplicateErrors.push(message.text());
  });
  await page.route('**/v1/search/tracks*', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    const track = data.tracks[0];
    track.genres.push({
      ...track.genres[0],
      source: 'Additional fixture provider',
      scope: 'album',
      evidence: 'indicative',
    });
    await route.fulfill({ response, json: data });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Velvet Orbit 상세 보기' }).click();
  await expect(page.getByRole('dialog').locator('.detail-tags > span')).toHaveCount(2);
  expect(duplicateErrors).toEqual([]);
});

async function nav(page: Page, label: string) {
  if ((page.viewportSize()?.width || 1440) <= 650)
    await page.getByRole('button', { name: '메뉴 열기', exact: true }).click();
  await page
    .getByRole('navigation', { name: '주 메뉴' })
    .getByRole('button', { name: label, exact: true })
    .click();
}
test('discovery, mood filter, Korean search, empty state and responsive layout', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.track-card')).toHaveCount(16);
  await expect(
    page.getByText('가상 곡으로 검색·추천·저장을 체험할 수 있어요.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: '몽환적인', exact: true }).click();
  const count = await page.locator('.track-card').count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThan(16);
  await page.getByRole('button', { name: '전체', exact: true }).click();
  await expect(page.locator('.track-card')).toHaveCount(16);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await mkdir('.runtime/screenshots', { recursive: true });
  await page.screenshot({
    path: `.runtime/screenshots/${info.project.name}-home.png`,
    fullPage: true,
  });
  await page.getByRole('textbox', { name: '노래 또는 아티스트 검색' }).fill('새벽');
  await page.getByRole('button', { name: '검색 실행' }).click();
  await expect(page.locator('.track-card')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '새벽의 결 상세 보기' })).toBeVisible();
  await page
    .getByRole('textbox', { name: '노래 또는 아티스트 검색' })
    .fill('there-is-no-song-like-this');
  await page.getByRole('button', { name: '검색 실행' }).click();
  await expect(page.getByText('아직 이 결의 음악을 찾지 못했어요')).toBeVisible();
  expect(errors).toEqual([]);
});
test('track detail exposes provenance and recommendation modes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Velvet Orbit 상세 보기' }).click();
  const dialog = page.getByRole('dialog', { name: '노래의 결' });
  await expect(dialog.locator('.genre-explanation')).toContainText('Nu jazz');
  await expect(dialog.locator('.genre-explanation')).toContainText('Electronic');
  await expect(dialog.locator('.genre-explanation')).toContainText('등록된 주요 장르는');
  await expect(
    dialog.getByText('실제 음악의 분석 결과가 아닙니다.', { exact: false }),
  ).toBeVisible();
  await expect(dialog.locator('.recommend-row').first()).toBeVisible();
  await dialog.getByLabel('추천 기준').selectOption('mood');
  await expect(dialog.locator('.recommend-row').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});
test('register, save, reorder, edit, refresh session, relogin and delete a persistent playlist', async ({
  page,
}, info) => {
  const email = `${info.project.name}-${Date.now()}@example.test`,
    password = 'Test-strong-password-123';
  await page.goto('/');
  await page.getByRole('button', { name: 'Velvet Orbit 플레이리스트에 추가', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '회원가입', exact: true }).click();
  await dialog.getByLabel('이름', { exact: true }).fill('음악테스터');
  await dialog.getByLabel('이메일', { exact: true }).fill(email);
  await dialog.getByLabel('비밀번호', { exact: true }).fill(password);
  await dialog.locator('form').getByRole('button', { name: '회원가입', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '어디에 담아볼까요?' })).toBeVisible();
  await page.getByRole('button', { name: '새 플레이리스트에 담기', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('플레이리스트 이름').fill('밤의 결');
  await dialog.getByLabel('설명', { exact: false }).fill('E2E에서 만든 나만의 음악');
  await dialog.getByRole('button', { name: '플레이리스트 만들기', exact: true }).click();
  await expect(page.locator('.playlist-heading h2')).toHaveText('밤의 결');
  await expect(page.locator('.playlist-row')).toHaveCount(1);
  await nav(page, '발견하기');
  await page.getByRole('button', { name: '새벽의 결 플레이리스트에 추가', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /밤의 결/ })
    .click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await nav(page, '내 라이브러리');
  await expect(page.locator('.playlist-row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Velvet Orbit 아래로 이동', exact: true }).click();
  await expect(page.locator('.playlist-row').first()).toContainText('새벽의 결');
  await page.getByRole('button', { name: '이름 수정', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('플레이리스트 이름').fill('새벽의 결 모음');
  await dialog.getByRole('button', { name: '수정 저장' }).click();
  await expect(page.locator('.playlist-heading h2')).toHaveText('새벽의 결 모음');
  await page.reload();
  await nav(page, '내 라이브러리');
  await page.locator('.playlist-tile').filter({ hasText: '새벽의 결 모음' }).click();
  await expect(page.locator('.playlist-row')).toHaveCount(2);
  await expect(page.locator('.playlist-row').first()).toContainText('새벽의 결');
  if (info.project.name === 'mobile')
    await page.getByRole('button', { name: '메뉴 열기', exact: true }).click();
  await page.locator('.account-button').click();
  await expect(page.getByText('취향을 오래 간직해 보세요')).toBeVisible();
  if (info.project.name === 'mobile') await nav(page, '내 라이브러리');
  await page.getByRole('button', { name: '로그인하기', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('이메일', { exact: true }).fill(email);
  await dialog.getByLabel('비밀번호', { exact: true }).fill(password);
  await dialog.locator('form').getByRole('button', { name: '로그인', exact: true }).click();
  await page.locator('.playlist-tile').filter({ hasText: '새벽의 결 모음' }).click();
  await expect(page.locator('.playlist-row')).toHaveCount(2);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '플레이리스트 삭제', exact: true }).click();
  await expect(page.getByText('첫 플레이리스트를 만들어 보세요')).toBeVisible();
});
test('recommendation playlist creation is one atomic save', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Velvet Orbit 상세 보기' }).click();
  await page.getByRole('button', { name: '이 결로 플레이리스트 만들기' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '회원가입', exact: true }).click();
  await dialog.getByLabel('이름', { exact: true }).fill('추천테스터');
  await dialog
    .getByLabel('이메일', { exact: true })
    .fill(`mix-${info.project.name}-${Date.now()}@example.test`);
  await dialog.getByLabel('비밀번호', { exact: true }).fill('Recommendation-pass-123');
  await dialog.locator('form').getByRole('button', { name: '회원가입', exact: true }).click();
  dialog = page.getByRole('dialog', { name: '새로운 취향의 시작' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '플레이리스트 만들기', exact: true }).click();
  await expect(page.locator('.playlist-heading h2')).toHaveText('Velvet Orbit의 결');
  expect(await page.locator('.playlist-row').count()).toBeGreaterThan(2);
});
test('provider failure is shown as an error, never disguised as sample success', async ({
  page,
}) => {
  await page.route('**/v1/search/tracks*', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'PROVIDER_UNAVAILABLE',
        message: '음악 정보 제공처에 연결할 수 없습니다.',
      }),
    }),
  );
  await page.goto('/');
  await expect(
    page.getByRole('alert').filter({ hasText: '음악을 불러오지 못했어요' }),
  ).toContainText('음악 정보 제공처에 연결할 수 없습니다.');
  await expect(page.locator('.track-card')).toHaveCount(0);
});
