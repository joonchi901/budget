import { setPreVisit, setPostVisit, type TestRunnerConfig } from '@storybook/test-runner';
import { getViolations, injectAxe } from 'axe-playwright';
import { mkdir } from 'node:fs/promises';

const config: TestRunnerConfig = {
  async preVisit(page) {
    await page.setViewportSize({ width: Number(process.env.UI_TEST_WIDTH || 1440), height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/api/**', (route) => route.abort('blockedbyclient'));
  },
  async postVisit(page, context) {
    await injectAxe(page);
    const violations = await getViolations(page, 'body', {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
    });
    if (violations.length)
      throw new Error(
        JSON.stringify(
          violations.map(({ id, impact, nodes }) => ({
            id,
            impact,
            nodes: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
          })),
          null,
          2,
        ),
      );
    const overflow = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    if (overflow.content > overflow.viewport + 1) {
      throw new Error(`가로 넘침: 화면 ${overflow.viewport}px / 내용 ${overflow.content}px`);
    }
    if (
      /roomheader--(root-room|mobile320)|ledgerrooms--(populated|long-names)|guide-.*--overview/.test(
        context.id,
      )
    ) {
      await mkdir('output/storybook', { recursive: true });
      await page.screenshot({
        path: `output/storybook/${context.id}-${process.env.UI_TEST_WIDTH || 1440}.png`,
        fullPage: true,
      });
    }
  },
};
setPreVisit(config.preVisit!);
setPostVisit(config.postVisit!);
