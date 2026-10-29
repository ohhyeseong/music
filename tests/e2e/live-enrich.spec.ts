import { test, expect } from '@playwright/test';

// Provider responses are mocked: this checks the UI contract, not the real Apple/MusicBrainz data.
const base = {
  id: 'live-fixture',
  title: '자동 보강 테스트 곡',
  artist: '가상 테스트 아티스트',
  album: '보강 테스트',
  durationMs: 200000,
  artworkUrl: null,
  externalUrl: null,
  palette: 1,
  moods: [],
  isDemo: false,
};
const enriched = {
  ...base,
  genres: [
    {
      slug: 'nu-jazz',
      name: 'Nu jazz',
      scope: 'recording',
      source: 'MusicBrainz',
      sourceUrl: 'https://musicbrainz.org/recording/fixture',
      evidence: 'confirmed',
    },
  ],
};
let enrichCalls = 0;

test.beforeEach(async ({ page }) => {
  enrichCalls = 0;
  await page.route('**/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/refresh')) {
      await route.fulfill({ status: 401, json: { message: '로그인이 필요해요.' } });
    } else if (path.endsWith('/search/tracks')) {
      await route.fulfill({
        json: { tracks: [{ ...base, genres: [] }], mode: 'live', hasMore: false, nextCursor: null },
      });
    } else if (path.endsWith('/enrich')) {
      enrichCalls += 1;
      await route.fulfill({ json: { track: enriched, enrichment: 'updated' } });
    } else {
      await route.fulfill({ json: { items: [] } });
    }
  });
});

test('live mode hides mood chips that have no data and explains why', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('group', { name: '분위기 필터' })).toHaveCount(0);
  await expect(page.getByText('아직 분위기 정보가 없어요')).toBeVisible();
});

test('opening a live track fetches recording genres once automatically', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: `${base.title} 상세 보기` }).click();
  await expect(page.getByText('이 곡에 등록된 주요 장르는 Nu jazz입니다.')).toBeVisible();
  expect(enrichCalls).toBe(1);
});
