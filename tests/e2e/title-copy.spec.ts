import { test, expect } from '@playwright/test';

const title = '새벽의 결 (Live) — 복사 테스트';
const track = {
  id: 'copy-fixture',
  title,
  artist: '가상 테스트 아티스트',
  album: '복사 테스트',
  durationMs: 180000,
  artworkUrl: null,
  externalUrl: null,
  palette: 0,
  genres: [],
  moods: [],
  isDemo: true,
};

test.beforeEach(async ({ page }) => {
  await page.route('**/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/refresh')) {
      await route.fulfill({ status: 401, json: { message: '로그인이 필요해요.' } });
    } else if (path.endsWith('/search/tracks')) {
      await route.fulfill({
        json: { tracks: [track], mode: 'demo', hasMore: false, nextCursor: null },
      });
    } else {
      await route.fulfill({ json: { items: [] } });
    }
  });
});

test('copies the exact title from card and detail, then pastes it into search', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByRole('button', { name: `${title} 제목 복사`, exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(title);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const search = page.getByRole('textbox', { name: '노래 또는 아티스트 검색' });
  await search.focus();
  await page.keyboard.press('Control+V');
  await expect(search).toHaveValue(title);
  await page.getByRole('button', { name: `${title} 상세 보기` }).click();
  const detail = page.getByRole('dialog', { name: '노래의 결' });
  await page.evaluate(() => navigator.clipboard.writeText('old clipboard'));
  await detail.getByRole('button', { name: `${title} 제목 복사`, exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(title);
  await expect(detail.getByRole('button', { name: `${title} 제목 복사` })).toContainText(
    '복사했어요',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('clipboard rejection offers manual selection without claiming success', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new DOMException('Denied', 'NotAllowedError');
        },
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: `${title} 상세 보기` }).click();
  await page
    .getByRole('dialog', { name: '노래의 결' })
    .getByRole('button', { name: `${title} 제목 복사`, exact: true })
    .click();
  const fallback = page.getByRole('dialog', { name: '제목 직접 복사' });
  const input = fallback.getByRole('textbox', { name: '복사할 노래 제목' });
  await expect(input).toHaveValue(title);
  await expect(input).toBeFocused();
  expect(
    await input.evaluate((element: HTMLInputElement) =>
      element.value.slice(element.selectionStart!, element.selectionEnd!),
    ),
  ).toBe(title);
  await expect(page.getByText('복사했어요', { exact: true })).toHaveCount(0);
  await fallback.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '노래의 결' })).toBeVisible();
});
