import { generateConcreteReport } from "./generateConcreteReport.js";
import { generateReport } from "./generateReport.js";

let reportButtonBound = false;

export function createReportGenerationRunner({
  concreteGenerator = generateConcreteReport,
  steelGenerator = generateReport,
} = {}) {
  let isGenerating = false;

  return async function runReportGeneration(materialOverride) {
    if (isGenerating) {
      return;
    }

    isGenerating = true;

    try {
      const material = materialOverride ?? document.getElementById("designMaterial")?.value ?? "steel";

      if (material === "concrete") {
        await concreteGenerator();
        return;
      }

      await steelGenerator();
    } finally {
      isGenerating = false;
    }
  };
}

export function bindReportGenerationButton() {
  if (reportButtonBound) return;

  const button = document.getElementById("generateReportBtn");

  if (!button) return;

  reportButtonBound = true;

  const runReportGeneration = createReportGenerationRunner();

  button.addEventListener("click", () => {
    void runReportGeneration();
  });
}
