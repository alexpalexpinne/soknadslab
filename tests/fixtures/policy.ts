import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { Store } from "../../server/store";
import { createApp } from "../../server/app";
import { PROGRAMME } from "../../src/domain";
import { test as applicantTest } from "./test";

type PolicyServer = { origin: string; setTime: (instant: Date) => void };

// The test owns this real API/SQLite server and its clock. Each case gets its own
// ephemeral loopback port; there is no HTTP time-control route or shared reset.
export const test = applicantTest.extend<{
  policyServer: PolicyServer;
  setServerTime: PolicyServer["setTime"];
}>({
  policyServer: async ({ browserName }, use) => {
    let now = Date.parse(PROGRAMME.closesAt) - 60_000;
    const store = new Store(":memory:", () => new Date(now));
    const app = createApp(store);
    app.use(express.static(resolve("dist")));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(resolve("dist/index.html")),
    );
    const server = createServer(app);
    try {
      await new Promise<void>((ready, reject) => {
        server.once("error", (cause) =>
          reject(
            new Error(
              `Could not start isolated policy server for ${browserName}.`,
              { cause },
            ),
          ),
        );
        server.listen(0, "127.0.0.1", ready);
      });
      await use({
        origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        setTime: (instant) => {
          now = instant.getTime();
        },
      });
    } finally {
      await new Promise<void>((closed) => server.close(() => closed()));
      store.close();
    }
  },
  baseURL: async ({ policyServer }, use) => use(policyServer.origin),
  setServerTime: async ({ policyServer }, use) => use(policyServer.setTime),
});
export { expect } from "./test";
