import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type TestInfo } from "@playwright/test";

export async function scan(page: Page, testInfo: TestInfo, state: string) {
  const result = await new AxeBuilder({ page })
    .withTags([
      "wcag2a",
      "wcag2aa",
      "wcag21a",
      "wcag21aa",
      "wcag22aa",
      "best-practice",
    ])
    .analyze();
  await testInfo.attach(`axe-${state}`, {
    body: JSON.stringify(result, null, 2),
    contentType: "application/json",
  });
  expect(result.violations, `Accessibility violations in ${state}`).toEqual([]);
}
