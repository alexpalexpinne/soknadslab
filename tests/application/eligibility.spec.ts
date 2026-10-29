import { test, expect } from "../fixtures/test";
import { validFields } from "../fixtures/data";

test("ineligible project stage survives draft saving but blocks submission with useful recovery @smoke", async ({
  page,
  context,
  draft,
}) => {
  const application = await draft(true);
  await page.goto(`/#/applications/${application.id}`);
  await page.getByLabel("Project stage").selectOption("production");
  await expect(
    page.getByText(
      "Production and completed projects are not eligible for this programme.",
      { exact: false },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Draft saved" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "My applications" }).click();
  await page
    .getByRole("link", { name: validFields.title, exact: true })
    .click();
  await expect(page.getByLabel("Project stage")).toHaveValue("production");

  await page.getByRole("button", { name: "Submit application" }).click();
  const summary = page.getByRole("alert");
  await expect(summary).toBeFocused();
  await expect(summary).toContainText("development work only");
  const retained = await (
    await context.request.get(`/api/applications/${application.id}`)
  ).json();
  expect(retained).toMatchObject({
    status: "draft",
    receipt: null,
    fields: { ...validFields, projectStage: "production" },
  });
  await summary.getByRole("link").click();
  await expect(page.getByLabel("Project stage")).toBeFocused();
  await page.getByLabel("Project stage").selectOption("development");
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(
    page.getByRole("heading", { name: "Application submitted" }),
  ).toBeVisible();
});
