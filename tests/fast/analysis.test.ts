import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  diagnosticPacket,
  OLLAMA_URL,
  requestHypotheses,
} from "../../scripts/analysis";
import { qualitySummary } from "../../scripts/quality-summary";

it("exports only failed/flaky evidence and removes non-allowlisted sensitive payloads", () => {
  const packet = diagnosticPacket({
    schemaVersion: 1,
    cookies: "secret",
    cases: [
      {
        title: "Fictional failed case",
        project: "chromium",
        outcome: "unexpected",
        requestBody: "private",
        attempts: [
          {
            status: "failed",
            retry: 0,
            signals: ["toBeVisible assertion failed"],
            requests: [
              {
                method: "GET",
                path: "/api/applications/:id",
                status: 500,
                body: "private",
              },
            ],
            attachment: "private",
          },
        ],
      },
      {
        title: "Passing case",
        project: "chromium",
        outcome: "expected",
        attempts: [{ status: "passed", retry: 0, signals: [] }],
      },
    ],
  });
  expect(packet.evidence).toHaveLength(1);
  expect(packet.evidence[0].attempts[0].requests).toEqual([
    { method: "GET", path: "/api/applications/:id", status: 500 },
  ]);
  expect(JSON.stringify(packet)).not.toContain("private");
  expect(JSON.stringify(packet)).not.toContain("secret");
  // The failing test's own title carries the requirement, not a global rule.
  expect(packet).not.toHaveProperty("requirement");
  expect(packet.evidence[0].title).toBe("Fictional failed case");
});

it("summarises quality metrics and lists only failed or flaky cases", () => {
  const summary = qualitySummary({
    status: "failed",
    durationMs: 12_345,
    executedCases: 3,
    firstAttemptCriticalPassRate: 0.5,
    flakyCases: 1,
    flakyRate: 1 / 3,
    cases: [
      { title: "Passing case", project: "chromium", outcome: "expected" },
      { title: "Broken case", project: "firefox", outcome: "unexpected" },
      { title: "Unstable case", project: "webkit", outcome: "flaky" },
    ],
  });
  expect(summary).toContain(
    "| First-attempt pass rate, critical journeys | 50.0 % |",
  );
  expect(summary).toContain("| Flaky cases | 1 (33.3 %) |");
  expect(summary).toContain("- Broken case (firefox, unexpected)");
  expect(summary).toContain("- Unstable case (webkit, flaky)");
  expect(summary).not.toContain("Passing case");
});

describe("local model call", () => {
  const packet = diagnosticPacket(
    JSON.parse(readFileSync("docs/examples/fictional-failure.json", "utf8")),
  );

  it("sends only the packet to the local model and labels the answer unreviewed", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const fakeOllama = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return Response.json({ response: "Hypothesis: stale rendering." });
    }) as typeof fetch;

    const text = await requestHypotheses(packet, "small-model", fakeOllama);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(OLLAMA_URL);
    expect(new URL(calls[0].url).hostname).toBe("127.0.0.1");
    expect(calls[0].body).toMatchObject({
      model: "small-model",
      stream: false,
      options: { temperature: 0 },
    });
    expect(JSON.parse(String(calls[0].body.prompt))).toEqual(packet);
    expect(text).toMatch(/^UNREVIEWED MODEL HYPOTHESES/);
    expect(text).toContain("Hypothesis: stale rendering.");
  });

  it.each([
    ["an error status", () => new Response("unavailable", { status: 503 })],
    ["an empty answer", () => Response.json({ response: "  " })],
  ])("fails clearly on %s and keeps the packet", async (_case, reply) => {
    const fakeOllama = (async () => reply()) as unknown as typeof fetch;
    await expect(
      requestHypotheses(packet, "small-model", fakeOllama),
    ).rejects.toThrow("evidence packet is still available");
  });
});
