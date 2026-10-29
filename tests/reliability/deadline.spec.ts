import { test, expect } from "../fixtures/policy";
import { scan } from "../fixtures/accessibility";
import { PROGRAMME } from "../../src/domain";
import { validFields } from "../fixtures/data";

test("deadline passing while a form is open rejects submission and keeps work saveable @smoke @a11y", async ({
  page,
  context,
  draft,
  setServerTime,
}, testInfo) => {
  const application = await draft(true);
  await page.goto(`/#/applications/${application.id}`);
  await expect(page.getByLabel("Project title")).toHaveValue(validFields.title);
  await expect(page.getByText(/Deadline:.*13:00.*Europe\/Oslo/)).toBeVisible();
  await page
    .getByLabel("Project title")
    .fill("Work entered just before closing");

  // Advance the backend clock, not the browser's Date or a mocked response.
  setServerTime(new Date(PROGRAMME.closesAt));
  const rejection = page.waitForResponse((response) =>
    response.url().endsWith(`/api/applications/${application.id}/submit`),
  );
  await page.getByRole("button", { name: "Submit application" }).click();
  expect((await rejection).status()).toBe(409);
  await expect(page.getByRole("alert")).toContainText("deadline has passed");
  await expect(page.getByLabel("Project title")).toHaveValue(
    "Work entered just before closing",
  );
  await expect(
    page.getByRole("button", { name: "Submit application" }),
  ).toBeDisabled();
  const retained = await (
    await context.request.get(`/api/applications/${application.id}`)
  ).json();
  expect(retained).toMatchObject({
    status: "draft",
    receipt: null,
    revision: application.revision,
    fields: validFields,
    attachment: application.attachment,
  });

  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Draft saved" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Project title")).toHaveValue(
    "Work entered just before closing",
  );
  await expect(
    page.getByText("This funding round is closed.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Submit application" }),
  ).toBeDisabled();
  await scan(page, testInfo, "closed-draft");
  await page.getByRole("link", { name: "My applications" }).click();
  await expect(
    page.getByRole("button", { name: "Start application" }),
  ).toBeDisabled();
});
