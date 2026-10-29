import { test, expect } from "../fixtures/test";
import { scan } from "../fixtures/accessibility";

test("login and applicant dashboard have no detected accessibility violations @a11y", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await scan(page, testInfo, "login");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your applications", exact: true }),
  ).toBeVisible();
  await scan(page, testInfo, "dashboard");
  await page
    .getByRole("navigation", { name: "Portal", exact: true })
    .getByRole("link", { name: "Funding programmes" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Funding programmes", exact: true }),
  ).toBeVisible();
  await scan(page, testInfo, "programmes");
  await page
    .getByRole("navigation", { name: "Portal", exact: true })
    .getByRole("link", { name: "Guidance" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Application guidance" }),
  ).toBeVisible();
  await scan(page, testInfo, "guidance");
});

test("draft form and validation feedback have no detected accessibility violations @a11y", async ({
  page,
  draft,
}, testInfo) => {
  const application = await draft();
  await page.goto(`/#/applications/${application.id}`);
  await expect(
    page.getByRole("heading", { name: "Grant application", exact: true }),
  ).toBeVisible();
  await scan(page, testInfo, "draft");
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByRole("alert")).toBeFocused();
  await scan(page, testInfo, "validation");
});

test("submission receipt has no detected accessibility violations @a11y", async ({
  page,
  draft,
}, testInfo) => {
  const application = await draft(true);
  await page.goto(`/#/applications/${application.id}`);
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(
    page.getByRole("heading", { name: "Application submitted" }),
  ).toBeVisible();
  await scan(page, testInfo, "receipt");
});

test("keyboard user can skip navigation, start a draft and recover from a required-field error @a11y", async ({
  page,
  signIn,
}) => {
  // A narrow viewport also exposes controls covered by floating UI.
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn();
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Start application" }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to main content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Start application" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Grant application", exact: true }),
  ).toBeVisible();
  // Tab through the actual form rather than forcing focus onto Submit.
  for (let step = 0; step < 28; step++) {
    if (
      await page
        .getByRole("button", { name: "Submit application" })
        .evaluate((element) => element === document.activeElement)
    )
      break;
    await page.keyboard.press("Tab");
    // A visible action area must never cover a focused form control.
    const obscured = await page.evaluate(() => {
      const active = document.activeElement;
      if (!(
        active instanceof HTMLInputElement ||
        active instanceof HTMLSelectElement ||
        active instanceof HTMLTextAreaElement
      ))
        return false;
      const box = active.getBoundingClientRect();
      const visible = document.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2,
      );
      return !!visible && !active.contains(visible);
    });
    expect(obscured, "Focused form control is covered by another element").toBe(
      false,
    );
  }
  await expect(
    page.getByRole("button", { name: "Submit application" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Choose the project's current stage." }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Project stage")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByLabel("Project stage")).toHaveValue("development");
  await expect(page.getByLabel("Project stage")).toBeFocused();
});
