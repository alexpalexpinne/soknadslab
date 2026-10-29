import { mkdirSync, writeFileSync } from "node:fs";
import type { FullResult, Reporter, Suite } from "@playwright/test/reporter";

function failureSignal(message: string) {
  if (/accessibility violations|axe-/i.test(message))
    return "Accessibility assertion failed; inspect the attached axe report.";
  const matcher = message.match(
    /to(HaveValue|BeVisible|BeFocused|Equal|MatchObject|ContainText|HaveCount)/,
  );
  if (matcher)
    return `${matcher[0]} assertion failed; inspect trace and expected state.`;
  if (/timeout/i.test(message))
    return "Timeout; inspect request statuses and trace before classifying the cause.";
  return "Unclassified failure; inspect the local HTML report.";
}

// The test fixture attaches API method, masked route and status for failed tests.
function requestStatuses(attachments: { name: string; body?: Buffer }[]) {
  const body = attachments.find(
    (attachment) => attachment.name === "request-statuses",
  )?.body;
  return body ? JSON.parse(body.toString("utf8")) : [];
}

export default class QualityReporter implements Reporter {
  private suite?: Suite;
  onBegin(_config: unknown, suite: Suite) {
    this.suite = suite;
  }
  onEnd(result: FullResult) {
    const cases = this.suite!.allTests().map((test) => ({
      title: test.title,
      project: test.parent.project()?.name ?? "unknown",
      critical: test.title.includes("@smoke"),
      outcome: test.outcome(),
      attempts: test.results.map((attempt) => ({
        status: attempt.status,
        durationMs: attempt.duration,
        retry: attempt.retry,
        signals: attempt.errors.map((error) =>
          failureSignal(error.message ?? ""),
        ),
        requests: requestStatuses(attempt.attachments),
      })),
    }));
    const executed = cases.filter((test) =>
      test.attempts.some((attempt) => attempt.status !== "skipped"),
    );
    const critical = executed.filter((test) => test.critical);
    const flaky = executed.filter((test) => test.outcome === "flaky").length;
    const report = {
      schemaVersion: 1,
      status: result.status,
      durationMs: result.duration,
      executedCases: executed.length,
      firstAttemptCriticalPassRate: critical.length
        ? critical.filter((test) => test.attempts[0]?.status === "passed")
            .length / critical.length
        : null,
      flakyCases: flaky,
      flakyRate: executed.length ? flaky / executed.length : null,
      cases,
    };
    mkdirSync("reports", { recursive: true });
    writeFileSync("reports/quality.json", JSON.stringify(report, null, 2));
  }
}
