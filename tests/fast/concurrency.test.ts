import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { Store } from "../../server/store";
import { PROGRAMME } from "../../src/domain";
import { mockPdf, validFields } from "../fixtures/data";

const run = promisify(execFile);
const PROCESSES = 4;

it("separate processes submitting the same draft at once produce one submission and no errors", async () => {
  const directory = mkdtempSync(join(tmpdir(), "grant-concurrency-"));
  const path = join(directory, "shared.sqlite");
  const store = new Store(
    path,
    () => new Date(Date.parse(PROGRAMME.closesAt) - 60_000),
  );
  try {
    const owner = "fictional-owner";
    const draft = store.create(owner);
    store.attach(owner, draft.id, 0, mockPdf.name, mockPdf.buffer);
    const ready = store.save(owner, draft.id, 1, validFields);

    // Start time leaves room for every process to boot before they all submit.
    const startAt = Date.now() + 2_000;
    const results = await Promise.all(
      Array.from({ length: PROCESSES }, () =>
        run(process.execPath, [
          "--import",
          "tsx",
          resolve("tests/fixtures/submit-worker.ts"),
          path,
          owner,
          draft.id,
          String(ready.revision),
          String(startAt),
        ]).then(({ stdout }) => JSON.parse(stdout.trim())),
      ),
    );

    expect(results).toEqual(
      Array(PROCESSES).fill({ ok: true, receipt: `GQL-${draft.id}` }),
    );
    expect(store.get(owner, draft.id)).toMatchObject({
      status: "submitted",
      revision: ready.revision + 1,
      fields: validFields,
    });
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
}, 20_000);
