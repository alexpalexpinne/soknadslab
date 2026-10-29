import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../server/app";
import { Store } from "../../server/store";
import { emptyFields, MAX_ATTACHMENT_BYTES, PROGRAMME } from "../../src/domain";
import { mockPdf, validFields } from "../fixtures/data";

describe("grant API with real SQLite", () => {
  let store: Store;
  let agent: ReturnType<typeof request.agent>;
  const cutoff = Date.parse(PROGRAMME.closesAt);
  let now: number;
  beforeEach(async () => {
    now = cutoff - 60_000;
    store = new Store(":memory:", () => new Date(now));
    agent = request.agent(createApp(store));
    await agent.post("/api/session").expect(201);
  });
  afterEach(() => store.close());
  async function validDraft() {
    const { body: draft } = await agent.post("/api/applications").expect(201);
    const { body } = await agent
      .post(`/api/applications/${draft.id}/attachment`)
      .set("Content-Type", "application/pdf")
      .set("X-File-Name", mockPdf.name)
      .set("X-Draft-Revision", "0")
      .send(mockPdf.buffer)
      .expect(200);
    return body;
  }
  it("rejects incomplete submission on the server without changing draft state", async () => {
    const { body: draft } = await agent.post("/api/applications").expect(201);
    const response = await agent
      .post(`/api/applications/${draft.id}/submit`)
      .send({ revision: 0, fields: emptyFields })
      .expect(422);
    expect(response.body.errors).toHaveProperty("attachment");
    const { body } = await agent
      .get(`/api/applications/${draft.id}`)
      .expect(200);
    expect(body).toMatchObject({ status: "draft", revision: 0, receipt: null });
  });
  it.each(["", "production", "completed"] as const)(
    "permits saving stage %s but rejects its submission without mutating the draft",
    async (projectStage) => {
      const draft = await validDraft();
      const fields = { ...validFields, projectStage };
      const { body: saved } = await agent
        .put(`/api/applications/${draft.id}`)
        .send({ revision: draft.revision, fields })
        .expect(200);
      const rejected = await agent
        .post(`/api/applications/${draft.id}/submit`)
        .send({ revision: saved.revision, fields })
        .expect(422);
      expect(Object.keys(rejected.body.errors)).toEqual(["projectStage"]);
      const { body: retained } = await agent
        .get(`/api/applications/${draft.id}`)
        .expect(200);
      expect(retained).toEqual(saved);
    },
  );
  it.each([-1, 0, 1])(
    "enforces the deadline at %i ms from cutoff inside submission",
    async (offset) => {
      const draft = await validDraft();
      const { body: saved } = await agent
        .put(`/api/applications/${draft.id}`)
        .send({ revision: draft.revision, fields: validFields })
        .expect(200);
      now = cutoff + offset;
      const response = await agent
        .post(`/api/applications/${draft.id}/submit`)
        .send({
          revision: saved.revision,
          fields: { ...validFields, title: "Attempted at cutoff" },
        })
        .expect(offset < 0 ? 200 : 409);
      const { body: retained } = await agent
        .get(`/api/applications/${draft.id}`)
        .expect(200);
      if (offset < 0) {
        expect(retained).toMatchObject({
          status: "submitted",
          submittedAt: new Date(now).toISOString(),
          fields: { title: "Attempted at cutoff" },
        });
      } else {
        expect(response.body.code).toBe("deadline_passed");
        expect(retained).toMatchObject({
          status: "draft",
          receipt: null,
          submittedAt: null,
          revision: saved.revision,
          fields: saved.fields,
          attachment: saved.attachment,
        });
      }
    },
  );
  it("keeps saved work editable after closing and refuses new applications", async () => {
    const draft = await validDraft();
    now = cutoff;
    const { body: programmes } = await agent.get("/api/programmes").expect(200);
    expect(programmes[0]).toMatchObject({
      closesAt: PROGRAMME.closesAt,
      submissionOpen: false,
    });
    await agent.post("/api/applications").expect(409);
    const { body: saved } = await agent
      .put(`/api/applications/${draft.id}`)
      .send({ revision: draft.revision, fields: validFields })
      .expect(200);
    await agent
      .post(`/api/applications/${draft.id}/attachment`)
      .set("Content-Type", "application/pdf")
      .set("X-File-Name", "updated-budget.pdf")
      .set("X-Draft-Revision", String(saved.revision))
      .send(mockPdf.buffer)
      .expect(200);
    const { body: retained } = await agent
      .get(`/api/applications/${draft.id}`)
      .expect(200);
    expect(retained).toMatchObject({
      status: "draft",
      receipt: null,
      fields: validFields,
      round: { submissionOpen: false },
      attachment: { name: "updated-budget.pdf" },
    });
    const { body: applications } = await agent
      .get("/api/applications")
      .expect(200);
    expect(applications).toHaveLength(1);
  });
  it("returns the original receipt on a retry after closing without changing accepted data", async () => {
    const draft = await validDraft();
    now = cutoff - 1;
    const { body: submitted } = await agent
      .post(`/api/applications/${draft.id}/submit`)
      .send({ revision: draft.revision, fields: validFields })
      .expect(200);
    now = cutoff + 1;
    const { body: retry } = await agent
      .post(`/api/applications/${draft.id}/submit`)
      .send({
        revision: draft.revision,
        fields: {
          ...validFields,
          title: "Retry cannot replace accepted work",
          projectStage: "production",
        },
      })
      .expect(200);
    expect(retry).toMatchObject({
      receipt: submitted.receipt,
      submittedAt: submitted.submittedAt,
      fields: submitted.fields,
      revision: submitted.revision,
      status: "submitted",
    });
  });
  it("opens older saved fields without discarding work or assuming eligibility", async () => {
    const { body: draft } = await agent.post("/api/applications").expect(201);
    const legacyFields: Partial<typeof validFields> = { ...validFields };
    delete legacyFields.projectStage;
    store.db
      .prepare("UPDATE applications SET fields = ? WHERE id = ?")
      .run(JSON.stringify(legacyFields), draft.id);
    const { body: reopened } = await agent
      .get(`/api/applications/${draft.id}`)
      .expect(200);
    expect(reopened.fields).toEqual({ ...legacyFields, projectStage: "" });
  });
  it("repeated submit requests in one process return one durable receipt", async () => {
    // One process handles these in turn; true overlap is in concurrency.test.ts.
    const draft = await validDraft();
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        agent
          .post(`/api/applications/${draft.id}/submit`)
          .send({ revision: draft.revision, fields: validFields })
          .expect(200),
      ),
    );
    expect(new Set(results.map((result) => result.body.receipt)).size).toBe(1);
    const { body } = await agent.get("/api/applications").expect(200);
    expect(body).toHaveLength(1);
    expect(body[0].revision).toBe(draft.revision + 1);
  });
  it("rejects direct saves and attachment mutation after submission; retries cannot change fields", async () => {
    const draft = await validDraft();
    const submitted = await agent
      .post(`/api/applications/${draft.id}/submit`)
      .send({ revision: draft.revision, fields: validFields })
      .expect(200);
    await agent
      .put(`/api/applications/${draft.id}`)
      .send({
        revision: submitted.body.revision,
        fields: { ...validFields, title: "Changed" },
      })
      .expect(409);
    await agent
      .post(`/api/applications/${draft.id}/attachment`)
      .set("Content-Type", "application/pdf")
      .set("X-File-Name", "replacement.pdf")
      .set("X-Draft-Revision", String(submitted.body.revision))
      .send(mockPdf.buffer)
      .expect(409);
    const repeated = await agent
      .post(`/api/applications/${draft.id}/submit`)
      .send({
        revision: draft.revision,
        fields: { ...validFields, title: "Changed" },
      })
      .expect(200);
    expect(repeated.body.fields.title).toBe(validFields.title);
    expect(repeated.body.receipt).toBe(submitted.body.receipt);
  });
  it("rejects a stale save without overwriting newer work", async () => {
    const { body: draft } = await agent.post("/api/applications").expect(201);
    await agent
      .put(`/api/applications/${draft.id}`)
      .send({ revision: 0, fields: validFields })
      .expect(200);
    await agent
      .put(`/api/applications/${draft.id}`)
      .send({ revision: 0, fields: emptyFields })
      .expect(409);
    const { body } = await agent
      .get(`/api/applications/${draft.id}`)
      .expect(200);
    expect(body.fields).toEqual(validFields);
  });
  it("invalid replacement is rejected by the API and preserves the original file", async () => {
    const draft = await validDraft();
    await agent
      .post(`/api/applications/${draft.id}/attachment`)
      .set("Content-Type", "application/pdf")
      .set("X-File-Name", "invalid.pdf")
      .set("X-Draft-Revision", String(draft.revision))
      .send(Buffer.from("not PDF"))
      .expect(422);
    const { body } = await agent
      .get(`/api/applications/${draft.id}`)
      .expect(200);
    expect(body.attachment).toEqual(draft.attachment);
    expect(body.revision).toBe(draft.revision);
  });
  it("oversized attachment is rejected at the HTTP boundary without changing stored state", async () => {
    const draft = await validDraft();
    await agent
      .post(`/api/applications/${draft.id}/attachment`)
      .set("Content-Type", "application/pdf")
      .set("X-File-Name", "large.pdf")
      .set("X-Draft-Revision", String(draft.revision))
      .send(Buffer.alloc(MAX_ATTACHMENT_BYTES + 1))
      .expect(413);
    const { body } = await agent
      .get(`/api/applications/${draft.id}`)
      .expect(200);
    expect(body.attachment).toEqual(draft.attachment);
    expect(body.revision).toBe(draft.revision);
  });
  it("workspaces are isolated and unauthenticated mutation is blocked", async () => {
    const draft = await validDraft();
    const stranger = request.agent(createApp(store));
    await stranger.get(`/api/applications/${draft.id}`).expect(401);
    await stranger.post("/api/session").expect(201);
    await stranger.get(`/api/applications/${draft.id}`).expect(404);
    await stranger
      .put(`/api/applications/${draft.id}`)
      .send({ revision: draft.revision, fields: validFields })
      .expect(404);
  });
  it("saved drafts and receipts survive closing and reopening the database", () => {
    const directory = mkdtempSync(join(tmpdir(), "grant-quality-"));
    const path = join(directory, "test.sqlite");
    const clock = () => new Date(cutoff - 60_000);
    let diskStore = new Store(path, clock);
    try {
      const draft = diskStore.create("fictional-owner");
      const session = diskStore.createSession();
      const owner = diskStore.sessionOwner(session);
      diskStore.save("fictional-owner", draft.id, 0, validFields);
      diskStore.close();
      diskStore = new Store(path, clock);
      expect(diskStore.sessionOwner(session)).toBe(owner);
      expect(diskStore.get("fictional-owner", draft.id).fields).toEqual(
        validFields,
      );
      diskStore.attach(
        "fictional-owner",
        draft.id,
        1,
        mockPdf.name,
        mockPdf.buffer,
      );
      const submitted = diskStore.submit(
        "fictional-owner",
        draft.id,
        2,
        validFields,
      );
      diskStore.close();
      diskStore = new Store(path, clock);
      expect(diskStore.get("fictional-owner", draft.id)).toEqual(submitted);
    } finally {
      diskStore.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
