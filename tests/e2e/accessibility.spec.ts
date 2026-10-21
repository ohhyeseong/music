import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFile, mkdir } from 'node:fs/promises';
test('accessibility: discovery and track dialog meet WCAG A/AA checks', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.locator('.track-card')).toHaveCount(16);
  for (const screen of ['home', 'detail']) {
    if (screen === 'detail')
      await page.getByRole('button', { name: 'Velvet Orbit 상세 보기' }).click();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    await mkdir('.runtime', { recursive: true });
    await writeFile(
      `.runtime/axe-${info.project.name}-${screen}.json`,
      JSON.stringify(results, null, 2),
    );
    expect(
      results.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
    ).toEqual([]);
  }
});
