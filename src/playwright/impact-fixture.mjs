import { test as base, expect } from '@playwright/test';
import { collectImpactCoverage } from './coverage-collector.mjs';

export const test = attachImpactCoverage(base);
export { expect };
export { collectImpactCoverage };

export function attachImpactCoverage(playwrightTest) {
  playwrightTest.afterEach(async ({ page }, testInfo) => {
    await collectImpactCoverage({ page, testInfo });
  });
  return playwrightTest;
}
