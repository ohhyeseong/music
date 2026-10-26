import { expect, test } from '@playwright/test';

// Synthetic artwork bytes and metadata: these tests do not verify Apple connectivity.
const cover = 'https://is1-ssl.mzstatic.com/image/thumb/test-fixture/100x100bb.jpg';
const track = {
  id: 'artwork-fixture',
  title: '앨범 이미지 테스트',
  artist: 'Fixture artist',
  album: 'Fixture album',
  durationMs: 180000,
  artworkUrl: cover,
  externalUrl: 'https://music.apple.com/us/album/fixture/123?i=456&app=itunes',
  palette: 0,
  isDemo: false,
  genres: [],
  moods: [],
};
test.beforeEach(async ({ page }) => {
  await page.route('**/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/refresh'))
      await route.fulfill({ status: 401, json: { message: '로그인이 필요해요.' } });
    else if (path.endsWith('/search/tracks'))
      await route.fulfill({
        json: { tracks: [track], mode: 'live', hasMore: false, nextCursor: null },
      });
    else await route.fulfill({ json: { items: [] } });
  });
});

test('shows paired artwork and official store badge on card and detail', async ({ page }) => {
  await page.route(cover, (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="purple"/></svg>',
    }),
  );
  await page.goto('/');
  const card = page.locator('.track-card');
  await expect(card.locator('.album-cover-image')).toBeVisible();
  expect(
    await card
      .locator('.album-cover-image')
      .evaluate((image: HTMLImageElement) => image.naturalWidth),
  ).toBeGreaterThan(0);
  await expect(
    card.getByRole('link', { name: `${track.title} iTunes Store에서 보기 (새 창)` }),
  ).toHaveAttribute('href', track.externalUrl);
  const badge = card.locator('.store-badge img');
  await expect(badge).toBeVisible();
  expect(await badge.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await card.getByRole('button', { name: `${track.title} 상세 보기` }).click();
  const dialog = page.getByRole('dialog', { name: '노래의 결' });
  await expect(dialog.getByRole('img', { name: `${track.title} 앨범 커버` })).toBeVisible();
  await expect(dialog.locator('.store-badge')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('failed image restores the complete fallback cover', async ({ page }) => {
  await page.route(cover, (route) => route.abort());
  await page.goto('/');
  const card = page.locator('.track-card');
  await expect(card.locator('.art-title')).toHaveText(track.title);
  await expect(card.locator('.album-cover-image')).toHaveCount(0);
  await card.getByRole('button', { name: `${track.title} 상세 보기` }).click();
  const detail = page.getByRole('dialog', { name: '노래의 결' });
  await expect(detail.locator('.detail-cover .art-title')).toHaveText(track.title);
  await expect(detail.locator('.album-cover-image')).toHaveCount(0);
});
