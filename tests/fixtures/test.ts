import { test as base, expect, type Page } from "@playwright/test";
import type { Application } from "../../src/domain";
import { validFields, mockPdf } from "./data";

type Fixtures = {
  signIn: () => Promise<void>;
  draft: (complete?: boolean) => Promise<Application>;
};
export const test = base.extend<Fixtures>({
  context: async ({ context, baseURL }, use, testInfo) => {
    const origin = new URL(baseURL!);
    if (origin.hostname !== "127.0.0.1")
      throw new Error("Browser tests require a loopback demo server.");
    const requests: { method: string; path: string; status: number }[] = [];
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin.origin)
        throw new Error(
          "Browser tests may access only their isolated local demo origin.",
        );
      return route.continue();
    });
    context.on("response", (response) => {
      const url = new URL(response.url());
      if (url.pathname.startsWith("/api/"))
        requests.push({
          method: response.request().method(),
          path: url.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ":id"),
          status: response.status(),
        });
    });
    await use(context);
    if (testInfo.status !== testInfo.expectedStatus)
      await testInfo.attach("request-statuses", {
        body: JSON.stringify(requests, null, 2),
        contentType: "application/json",
      });
    await context.request.delete("/api/session");
  },
  signIn: async ({ context }, use) => {
    await use(async () => {
      expect((await context.request.post("/api/session")).status()).toBe(201);
    });
  },
  draft: async ({ context, signIn }, use) => {
    await signIn();
    await use(async (complete = false) => {
      const created = await context.request.post("/api/applications");
      expect(created.status()).toBe(201);
      let application: Application = await created.json();
      if (complete) {
        const uploaded = await context.request.post(
          `/api/applications/${application.id}/attachment`,
          {
            headers: {
              "Content-Type": "application/pdf",
              "X-File-Name": mockPdf.name,
              "X-Draft-Revision": "0",
            },
            data: mockPdf.buffer,
          },
        );
        expect(uploaded.ok()).toBeTruthy();
        application = await uploaded.json();
        const saved = await context.request.put(
          `/api/applications/${application.id}`,
          { data: { revision: application.revision, fields: validFields } },
        );
        expect(saved.ok()).toBeTruthy();
        application = await saved.json();
      }
      return application;
    });
  },
});
export { expect };
export async function fillApplication(page: Page) {
  await page.getByLabel("Project stage").selectOption(validFields.projectStage);
  await page.getByLabel("Organisation name").fill(validFields.organisation);
  await page
    .getByLabel("Organisation number")
    .fill(validFields.organisationNumber);
  await page.getByLabel("Contact name").fill(validFields.contactName);
  await page.getByLabel("Email address").fill(validFields.email);
  await page.getByLabel("Project title").fill(validFields.title);
  await page.getByLabel("Project summary").fill(validFields.summary);
  await page.getByLabel("Requested amount").fill(validFields.amount);
  await page.getByLabel("I confirm").check();
}
