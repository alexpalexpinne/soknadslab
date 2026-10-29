import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import {
  type Application,
  type Fields,
  type Errors,
  PROGRAMME,
  fieldsSchema,
  roundIsOpen,
  emptyFields,
  submissionErrors,
} from "../src/domain.js";

export class DomainError extends Error {
  constructor(
    public status: number,
    message: string,
    public errors?: Errors,
    public code?: "deadline_passed",
  ) {
    super(message);
  }
}

type Row = {
  id: string;
  owner: string;
  fields: string;
  status: Application["status"];
  revision: number;
  saved_at: string;
  attachment_name: string | null;
  attachment_bytes: Uint8Array | null;
  receipt: string | null;
  submitted_at: string | null;
};

export class Store {
  readonly db: DatabaseSync;
  constructor(
    path: string,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS demo_sessions (id TEXT PRIMARY KEY, owner TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS applications (
        id TEXT PRIMARY KEY, owner TEXT NOT NULL, fields TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('draft', 'submitted')), revision INTEGER NOT NULL,
        saved_at TEXT NOT NULL, attachment_name TEXT, attachment_bytes BLOB,
        receipt TEXT UNIQUE, submitted_at TEXT
      );
    `);
  }
  close() {
    this.db.close();
  }
  createSession() {
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO demo_sessions (id, owner) VALUES (?, ?)")
      .run(id, randomUUID());
    return id;
  }
  sessionOwner(id: string) {
    return (
      this.db
        .prepare("SELECT owner FROM demo_sessions WHERE id = ?")
        .get(id) as { owner: string } | undefined
    )?.owner;
  }
  round() {
    return {
      closesAt: PROGRAMME.closesAt,
      timeZone: PROGRAMME.timeZone,
      submissionOpen: roundIsOpen(this.clock()),
    };
  }
  programme() {
    return { ...PROGRAMME, submissionOpen: this.round().submissionOpen };
  }
  private row(owner: string, id: string): Row {
    const row = this.db
      .prepare("SELECT * FROM applications WHERE id = ? AND owner = ?")
      .get(id, owner) as Row | undefined;
    if (!row) throw new DomainError(404, "Application not found.");
    return row;
  }
  private view(row: Row): Application {
    return {
      id: row.id,
      programmeId: PROGRAMME.id,
      round: this.round(),
      fields: fieldsSchema.parse(JSON.parse(row.fields)),
      status: row.status,
      revision: row.revision,
      savedAt: row.saved_at,
      receipt: row.receipt,
      submittedAt: row.submitted_at,
      attachment: row.attachment_name
        ? { name: row.attachment_name, size: row.attachment_bytes!.length }
        : null,
    };
  }
  get(owner: string, id: string) {
    return this.view(this.row(owner, id));
  }
  list(owner: string) {
    return (
      this.db
        .prepare(
          "SELECT * FROM applications WHERE owner = ? ORDER BY saved_at DESC, id",
        )
        .all(owner) as Row[]
    ).map((row) => this.view(row));
  }
  create(owner: string) {
    const createdAt = this.clock();
    if (!roundIsOpen(createdAt))
      throw new DomainError(
        409,
        "This funding round is closed. New applications cannot be started.",
        undefined,
        "deadline_passed",
      );
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO applications (id, owner, fields, status, revision, saved_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        owner,
        JSON.stringify(emptyFields),
        "draft",
        0,
        createdAt.toISOString(),
      );
    return this.get(owner, id);
  }
  // The WHERE clause repeats the revision check, so a write that lost a race changes nothing.
  private requireUpdated(result: { changes: number | bigint }) {
    if (Number(result.changes) !== 1)
      throw new DomainError(
        409,
        "A newer version exists. Your entries are still here. Copy them before reloading to compare versions.",
      );
  }
  private editable(row: Row, revision: number) {
    if (row.status === "submitted")
      throw new DomainError(
        409,
        "This application has been submitted and is read-only.",
      );
    if (row.revision !== revision)
      throw new DomainError(
        409,
        "A newer version exists. Your entries are still here. Copy them before reloading to compare versions.",
      );
  }
  save(owner: string, id: string, revision: number, fields: Fields) {
    this.editable(this.row(owner, id), revision);
    const result = this.db
      .prepare(
        "UPDATE applications SET fields = ?, revision = revision + 1, saved_at = ? WHERE id = ? AND owner = ? AND revision = ?",
      )
      .run(
        JSON.stringify(fields),
        this.clock().toISOString(),
        id,
        owner,
        revision,
      );
    this.requireUpdated(result);
    return this.get(owner, id);
  }
  attach(
    owner: string,
    id: string,
    revision: number,
    name: string,
    bytes: Uint8Array,
  ) {
    this.editable(this.row(owner, id), revision);
    const result = this.db
      .prepare(
        "UPDATE applications SET attachment_name = ?, attachment_bytes = ?, revision = revision + 1 WHERE id = ? AND owner = ? AND revision = ?",
      )
      .run(name, bytes, id, owner, revision);
    this.requireUpdated(result);
    return this.get(owner, id);
  }
  submit(owner: string, id: string, revision: number, fields: Fields) {
    // One synchronous transaction serialises competing requests and commits fields + receipt + state together.
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const row = this.row(owner, id);
      if (row.status === "submitted") {
        this.db.exec("COMMIT");
        return this.view(row); // The application ID is the idempotency key; return the original receipt.
      }
      this.editable(row, revision);
      // Capture one acceptance instant inside the transaction. A receipt retry above
      // remains successful even when the deadline has passed since the first commit.
      const acceptedAt = this.clock();
      if (!roundIsOpen(acceptedAt))
        throw new DomainError(
          409,
          "The application deadline has passed. Your draft is still available and can be saved, but cannot be submitted.",
          undefined,
          "deadline_passed",
        );
      const errors = submissionErrors(fields, this.view(row).attachment);
      if (Object.keys(errors).length)
        throw new DomainError(
          422,
          "Check the required information before submitting.",
          errors,
        );
      const now = acceptedAt.toISOString();
      const result = this.db
        .prepare(
          `UPDATE applications SET fields = ?, status = 'submitted', revision = revision + 1,
        saved_at = ?, submitted_at = ?, receipt = ? WHERE id = ? AND owner = ? AND revision = ?`,
        )
        .run(
          JSON.stringify(fields),
          now,
          now,
          `GQL-${id}`,
          id,
          owner,
          revision,
        );
      this.requireUpdated(result);
      this.db.exec("COMMIT");
      return this.get(owner, id);
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  removeWorkspace(owner: string) {
    this.db.prepare("DELETE FROM applications WHERE owner = ?").run(owner);
    this.db.prepare("DELETE FROM demo_sessions WHERE owner = ?").run(owner);
  }
}
