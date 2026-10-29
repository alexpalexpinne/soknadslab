import { readFile, mkdir, writeFile } from "node:fs/promises";
import { diagnosticPacket, requestHypotheses } from "./analysis";

const input = process.argv[2] ?? "reports/quality.json";
const packet = diagnosticPacket(JSON.parse(await readFile(input, "utf8")));
await mkdir("reports", { recursive: true });
await writeFile(
  "reports/diagnosis-packet.json",
  JSON.stringify(packet, null, 2),
);
console.log(
  `Prepared ${packet.evidence.length} failed/flaky cases in reports/diagnosis-packet.json. No model was called.`,
);
const option = process.argv.indexOf("--ollama");
if (option >= 0) {
  const model = process.argv[option + 1];
  if (!model || model.startsWith("--"))
    throw new Error(
      "Supply an already installed local Ollama model after --ollama.",
    );
  await writeFile(
    "reports/ai-hypotheses.txt",
    await requestHypotheses(packet, model),
  );
  console.log(
    "Saved unreviewed local-model hypotheses to reports/ai-hypotheses.txt.",
  );
}
