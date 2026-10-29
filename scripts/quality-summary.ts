import { readFile } from "node:fs/promises";

type QualityReport = {
  status: string;
  durationMs: number;
  executedCases: number;
  firstAttemptCriticalPassRate: number | null;
  flakyCases: number;
  flakyRate: number | null;
  cases: { title: string; project: string; outcome: string }[];
};

const percent = (value: number | null) =>
  value === null ? "n/a" : `${(value * 100).toFixed(1)} %`;

// Markdown for the GitHub Actions job summary, so quality goals are visible on every run.
export function qualitySummary(report: QualityReport) {
  const failing = report.cases.filter(
    (test) => test.outcome === "unexpected" || test.outcome === "flaky",
  );
  return [
    `### Quality summary: ${report.status}`,
    "",
    "| Metric | Value |",
    "| --- | --- |",
    `| Executed cases | ${report.executedCases} |`,
    `| First-attempt pass rate, critical journeys | ${percent(report.firstAttemptCriticalPassRate)} |`,
    `| Flaky cases | ${report.flakyCases} (${percent(report.flakyRate)}) |`,
    `| Duration | ${(report.durationMs / 1000).toFixed(1)} s |`,
    ...(failing.length
      ? [
          "",
          "**Failed or flaky:**",
          ...failing.map(
            (test) => `- ${test.title} (${test.project}, ${test.outcome})`,
          ),
        ]
      : []),
  ].join("\n");
}

if (process.argv[1]?.endsWith("quality-summary.ts"))
  console.log(
    qualitySummary(
      JSON.parse(
        await readFile(process.argv[2] ?? "reports/quality.json", "utf8"),
      ),
    ),
  );
