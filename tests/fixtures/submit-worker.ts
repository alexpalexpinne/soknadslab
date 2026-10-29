import { Store } from "../../server/store";
import { PROGRAMME } from "../../src/domain";
import { validFields } from "./data";

// Runs in its own process with its own SQLite connection, so competing
// submissions really overlap instead of queueing on one event loop.
const [path, owner, id, revision, startAt] = process.argv.slice(2);
const store = new Store(
  path,
  () => new Date(Date.parse(PROGRAMME.closesAt) - 60_000),
);
while (Date.now() < Number(startAt)); // Release every process at the same instant.
try {
  const submitted = store.submit(owner, id, Number(revision), validFields);
  console.log(JSON.stringify({ ok: true, receipt: submitted.receipt }));
} catch (error) {
  console.log(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
} finally {
  store.close();
}
