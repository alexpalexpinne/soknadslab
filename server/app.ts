import express, { type ErrorRequestHandler } from "express";
import { z } from "zod";
import {
  fieldsSchema,
  attachmentError,
  MAX_ATTACHMENT_BYTES,
} from "../src/domain.js";
import { Store, DomainError } from "./store.js";

const mutationSchema = z
  .object({ revision: z.number().int().nonnegative(), fields: fieldsSchema })
  .strict();

export function createApp(store: Store) {
  const app = express();
  app.disable("x-powered-by");
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "20kb" }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.post("/api/session", (_req, res) => {
    const id = store.createSession();
    res.cookie("demo_session", id, {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
    });
    res.status(201).json({ name: "Alex Example" });
  });
  app.use("/api", (req, res, next) => {
    const session = req.headers.cookie
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("demo_session="))
      ?.slice("demo_session=".length);
    const owner = session ? store.sessionOwner(session) : undefined;
    if (!owner) {
      res.status(401).json({ message: "Sign in to the local demo account." });
      return;
    }
    res.locals.owner = owner;
    res.locals.session = session;
    next();
  });
  app.get("/api/session", (_req, res) => res.json({ name: "Alex Example" }));
  app.delete("/api/session", (_req, res) => {
    store.removeWorkspace(res.locals.owner);
    res.clearCookie("demo_session", { path: "/" });
    res.sendStatus(204);
  });
  app.get("/api/programmes", (_req, res) => res.json([store.programme()]));
  app.get("/api/applications", (_req, res) =>
    res.json(store.list(res.locals.owner)),
  );
  app.post("/api/applications", (_req, res) =>
    res.status(201).json(store.create(res.locals.owner)),
  );
  app.get("/api/applications/:id", (req, res) =>
    res.json(store.get(res.locals.owner, req.params.id)),
  );
  app.put("/api/applications/:id", (req, res) => {
    const input = mutationSchema.parse(req.body);
    res.json(
      store.save(res.locals.owner, req.params.id, input.revision, input.fields),
    );
  });
  app.post(
    "/api/applications/:id/attachment",
    express.raw({ type: "*/*", limit: MAX_ATTACHMENT_BYTES }),
    (req, res) => {
      const revision = z.coerce
        .number()
        .int()
        .nonnegative()
        .parse(req.get("x-draft-revision"));
      const name = decodeURIComponent(req.get("x-file-name") ?? "");
      const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const error = attachmentError(name, req.get("content-type") ?? "", bytes);
      if (error) throw new DomainError(422, error);
      res.json(
        store.attach(res.locals.owner, req.params.id, revision, name, bytes),
      );
    },
  );
  app.post("/api/applications/:id/submit", (req, res) => {
    const input = mutationSchema.parse(req.body);
    res.json(
      store.submit(
        res.locals.owner,
        req.params.id,
        input.revision,
        input.fields,
      ),
    );
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ message: "Local API route not found." }),
  );
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof DomainError) {
      res.status(error.status).json({
        message: error.message,
        errors: error.errors,
        code: error.code,
      });
      return;
    }
    if (error instanceof z.ZodError || error instanceof URIError) {
      res.status(400).json({ message: "The request format is invalid." });
      return;
    }
    if (error.type === "entity.too.large") {
      res.status(413).json({
        message:
          "The file or request is too large. PDFs must be no larger than 1 MiB.",
      });
      return;
    }
    console.error("Local API error:", error);
    res.status(500).json({
      message:
        "The service could not complete the request. Your entries are still available. Please retry.",
    });
  };
  app.use(errorHandler);
  return app;
}
