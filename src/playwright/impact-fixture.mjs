import { test as base, expect } from '@playwright/test';
import { collectImpactCoverage } from './coverage-collector.mjs';

export const test = attachImpactCoverage(base);
export { expect };
export { collectImpactCoverage };

export function attachImpactCoverage(playwrightTest) {
  return playwrightTest.extend({
    _impactCoverage: [async ({ page }, use, testInfo) => {
      await use();
      await collectImpactCoverage({ page, testInfo });
    }, { auto: true }]
  });
}
