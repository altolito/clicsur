import { analyzeMessage } from "./analyzeMessage";

import packageScams from "../dataset/package-scams.json";
import marketingSms from "../dataset/marketing-sms.json";
import fakeContests from "../dataset/fake-contests.json";
import bankingScams from "../dataset/banking-scams.json";
import governmentScams from "../dataset/government-scams.json";
import subscriptionScams from "../dataset/subscription-scams.json";
import safeMessages from "../dataset/safe-messages.json";

type DatasetItem = {
  text: string;
  label: string;
  risk: "low" | "medium" | "high";
  expectedCategory: string;
  tags?: string[];
};

const datasets = {
  "package-scams": packageScams,
  "marketing-sms": marketingSms,
  "fake-contests": fakeContests,
  "banking-scams": bankingScams,
  "government-scams": governmentScams,
  "subscription-scams": subscriptionScams,
  "safe-messages": safeMessages,
};

const typedDatasets = datasets as Record<string, DatasetItem[]>;

function riskToFrench(risk: DatasetItem["risk"]) {
  if (risk === "low") return "Faible";
  if (risk === "medium") return "Moyen";
  return "Élevé";
}

export async function testDataset() {
  const results = [];

  for (const [datasetName, items] of Object.entries(typedDatasets)) {
    for (const item of items) {
      const analysis = await analyzeMessage(item.text);

      const expectedRisk = riskToFrench(item.risk);

      const categoryOk = analysis.category === item.expectedCategory;
      const riskOk = analysis.risk === expectedRisk;

      results.push({
        dataset: datasetName,
        label: item.label,
        expectedCategory: item.expectedCategory,
        actualCategory: analysis.category,
        categoryOk,
        expectedRisk,
        actualRisk: analysis.risk,
        riskOk,
        score: analysis.score,
        tags: item.tags ?? [],
        text: item.text,
      });
    }
  }

  console.table(results);

  const failed = results.filter(
    (result) => !result.categoryOk || !result.riskOk
  );

  if (failed.length > 0) {
    console.warn("Certains tests dataset échouent :", failed);
  } else {
    console.info("Tous les tests dataset sont cohérents.");
  }

  return {
    total: results.length,
    failed: failed.length,
    results,
  };
}