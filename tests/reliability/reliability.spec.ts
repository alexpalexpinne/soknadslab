import { test, expect } from "../fixtures/test";
import { mockPdf, validFields } from "../fixtures/data";
import { MAX_ATTACHMENT_BYTES } from "../../src/domain";

test("double-click and request retry keep one submission and the same receipt", async ({
  page,
  context,
  draft,
}) => {
  const application = await draft(true);
  await page.goto(`/#/applications/${application.id}`);
  await page.getByRole("button", { name: "Submit application" }).dblclick();
  await expect(
    page.getByRole("heading", { name: "Application submitted" }),
  ).toBeVisible();
  const retry = await context.request.post(
    `/api/applications/${application.id}/submit`,
    { data: { revision: application.revision, fields: validFields } },
  );
  expect(retry.ok()).toBeTruthy();
  const applications = await (
    await context.request.get("/api/applications")
  ).json();
  expect(applications).toHaveLength(1);
  expect(applications[0].receipt).toBe((await retry.json()).receipt);
  expect(applications[0].revision).toBe(application.revision + 1);
});

test("invalid attachment types, sizes and content cannot replace an existing budget", async ({
  page,
  context,
  draft,
}) => {
  const application = await draft(true);
  await page.goto(`/#/applications/${application.id}`);
  for (const file of [
    {
      name: "budget.exe",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("invalid"),
    },
    { name: "empty.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(0) },
    {
      name: "large.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.alloc(MAX_ATTACHMENT_BYTES + 1),
    },
  ]) {
    await page.getByLabel("Project budget").setInputFiles(file);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByText(mockPdf.name, { exact: true })).toBeVisible();
  }
  const stored = await (
    await context.request.get(`/api/applications/${application.id}`)
  ).json();
  expect(stored.attachment).toEqual(application.attachment);
  expect(stored.revision).toBe(application.revision);
});

test("failed upload preserves the previous attachment and unsaved form entries", async ({
  page,
  context,
  draft,
}) => {
  const application = await draft(true);
  await page.goto(`/#/applications/${application.id}`);
  await page.getByLabel("Project title").fill("Unsaved replacement title");
  await page.route(
    `**/api/applications/${application.id}/attachment`,
    (route) =>
      route.fulfill({
        status: 503,
        json: {
          message:
            "Upload unavailable. Your previous attachment is still saved.",
        },
      }),
  );
  await page
    .getByLabel("Project budget")
    .setInputFiles({ ...mockPdf, name: "replacement.pdf" });
  await expect(page.getByRole("alert")).toContainText(
    "previous attachment is still saved",
  );
  await expect(page.getByLabel("Project title")).toHaveValue(
    "Unsaved replacement title",
  );
  const stored = await (
    await context.request.get(`/api/applications/${application.id}`)
  ).json();
  expect(stored.attachment).toEqual(application.attachment);
});

test("save failure keeps entries available, leaves stored state clear and supports retry @smoke", async ({
  page,
  context,
  draft,
}) => {
  const application = await draft();
  await page.goto(`/#/applications/${application.id}`);
  await page.getByLabel("Project title").fill("Work that must not disappear");
  await page.route(`**/api/applications/${application.id}`, (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({
          status: 503,
          json: {
            message:
              "Save unavailable. Your entries are still here. Please retry.",
          },
        })
      : route.continue(),
  );
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Your entries are still here",
  );
  await expect(page.getByLabel("Project title")).toHaveValue(
    "Work that must not disappear",
  );
  const stored = await (
    await context.request.get(`/api/applications/${application.id}`)
  ).json();
  expect(stored).toMatchObject({
    status: "draft",
    revision: 0,
    fields: { title: "" },
  });
  await page.unroute(`**/api/applications/${application.id}`);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Draft saved" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Project title")).toHaveValue(
    "Work that must not disappear",
  );
});

test("a lost response after submission is reconciled to the committed receipt", async ({
  page,
  context,
  draft,
}) => {
  const application = await draft(true);
  await page.goto(`/#/applications/${application.id}`);
  await page.route(
    `**/api/applications/${application.id}/submit`,
    async (route) => {
      const response = await route.fetch();
      expect(response.ok()).toBeTruthy();
      await route.abort("failed");
    },
  );
  await page.getByRole("button", { name: "Submit application" }).click();
  await expect(
    page.getByRole("heading", { name: "Application submitted" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "confirmed after reconnecting",
  );
  const applications = await (
    await context.request.get("/api/applications")
  ).json();
  expect(applications).toHaveLength(1);
  expect(applications[0].status).toBe("submitted");
});

test("a stale browser tab cannot silently overwrite newer draft work", async ({
  page,
  context,
  draft,
}) => {
  const application = await draft(true);
  await page.goto(`/#/applications/${application.id}`);
  await expect(page.getByLabel("Project title")).toHaveValue(validFields.title);
  const newer = { ...validFields, title: "Newer work from another tab" };
  expect(
    (
      await context.request.put(`/api/applications/${application.id}`, {
        data: { revision: application.revision, fields: newer },
      })
    ).ok(),
  ).toBeTruthy();
  await page.getByLabel("Project title").fill("My stale tab edits");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("alert")).toContainText("A newer version exists");
  await expect(page.getByLabel("Project title")).toHaveValue(
    "My stale tab edits",
  );
  const stored = await (
    await context.request.get(`/api/applications/${application.id}`)
  ).json();
  expect(stored.fields.title).toBe(newer.title);
});
