import { generateReport } from "./generateReport.js";
import { generateConcreteReport } from "./generateConcreteReport.js";

let reportButtonBound = false;

export function bindReportGenerationButton() {
  if (reportButtonBound) return;

  const button = document.getElementById("generateReportBtn");

  if (!button) return;

  reportButtonBound = true;

  button.addEventListener("click", async () => {
    const material = document.getElementById("designMaterial")?.value ?? "steel";

    if (material === "concrete") {
      await generateConcreteReport();
      return;
    }

    await generateReport();
  });
}
