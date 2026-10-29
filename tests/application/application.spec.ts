import { test, expect, fillApplication } from "../fixtures/test";
import { mockPdf, validFields } from "../fixtures/data";

test("applicant saves, returns and submits one complete application @smoke", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Start application" }).click();
  await fillApplication(page);
  await page.getByLabel("Project budget").setInputFiles(mockPdf);
  await expect(
    page.getByRole("status").filter({ hasText: "Attachment uploaded" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Draft saved" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "My applications", exact: false })
    .click();
  await page.getByRole("link", { name: validFields.title }).click();
  await expect(page.getByLabel("Project summary")).toHaveValue(
    validFields.summary,
  );
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(
    page.getByRole("heading", { name: "Application submitted" }),
  ).toBeVisible();
  const applications = await (
    await context.request.get("/api/applications")
  ).json();
  expect(applications).toHaveLength(1);
  expect(applications[0]).toMatchObject({
    status: "submitted",
    fields: validFields,
    receipt: expect.stringMatching(/^GQL-/),
  });
});

test("saved information survives reopening and page reload; leaving unsaved work prompts the applicant @smoke", async ({
  page,
  draft,
}) => {
  const application = await draft();
  await page.goto(`/#/applications/${application.id}`);
  await page.getByLabel("Project title").fill("A saved fictional draft");
  // The new portal navigation must protect unsaved work too.
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("navigation", { name: "Portal", exact: true })
    .getByRole("link", { name: "Guidance" })
    .click();
  await expect(page.getByLabel("Project title")).toHaveValue(
    "A saved fictional draft",
  );
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("link", { name: "My applications" }).click();
  await expect(page.getByLabel("Project title")).toHaveValue(
    "A saved fictional draft",
  );
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Draft saved" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "My applications" }).click();
  await page.getByRole("link", { name: "A saved fictional draft" }).click();
  await page.reload();
  await expect(page.getByLabel("Project title")).toHaveValue(
    "A saved fictional draft",
  );
});

test("missing required information blocks submission and points to actionable errors @smoke", async ({
  page,
  draft,
  context,
}) => {
  const application = await draft();
  await page.goto(`/#/applications/${application.id}`);
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Enter an organisation name.",
  );
  await expect(page.getByRole("alert")).toContainText(
    "Attach a project budget PDF.",
  );
  await expect(page.getByRole("alert")).toBeFocused();
  const stored = await (
    await context.request.get(`/api/applications/${application.id}`)
  ).json();
  expect(stored).toMatchObject({ status: "draft", receipt: null });
});

test("submission remains read-only after reload and browser Back @smoke", async ({
  page,
  draft,
}) => {
  const application = await draft(true);
  await page.goto(`/#/applications/${application.id}`);
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(
    page.getByRole("heading", { name: "Application submitted" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Return to my applications" }).click();
  await expect(
    page.getByRole("heading", { name: "Your applications", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Drafts/ }).click();
  await expect(page.getByText("No applications in this view")).toBeVisible();
  await page.getByRole("button", { name: /^Submitted/ }).click();
  await expect(
    page.getByRole("link", { name: validFields.title }),
  ).toBeVisible();
  await page.goBack();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Application submitted" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Submit application" }),
  ).toHaveCount(0);
});
