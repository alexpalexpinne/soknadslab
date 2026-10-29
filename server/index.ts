import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import express from "express";
import { createServer } from "vite";
import { Store } from "./store.js";
import { createApp } from "./app.js";
import { PROGRAMME } from "../src/domain.js";

const testing = process.argv.includes("--test");
const built = process.argv.includes("--built");
const lan = process.argv.includes("--lan") && !testing;
await mkdir(".data", { recursive: true });
const store = new Store(
  testing ? ":memory:" : resolve(".data/demo.sqlite"),
  testing ? () => new Date(Date.parse(PROGRAMME.closesAt) - 60_000) : undefined,
);
const app = createApp(store);
const vite = built
  ? null
  : await createServer({ server: { middlewareMode: true }, appType: "custom" });
if (vite) {
  app.use(vite.middlewares);
  app.get("/{*path}", async (req, res) => {
    const html = await vite.transformIndexHtml(
      req.originalUrl,
      await readFile("index.html", "utf8"),
    );
    res.type("html").send(html);
  });
} else {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
}
const port = testing ? 4173 : 5173;
const host = lan ? "0.0.0.0" : "127.0.0.1";
const server = app.listen(port, host, () => {
  console.log(`Søknadslab: http://127.0.0.1:${port}`);
  if (lan) console.log(`LAN access enabled: http://<server-ip>:${port}`);
});
function shutdown() {
  server.close(() => {
    void vite?.close();
    store.close();
    process.exit(0);
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
