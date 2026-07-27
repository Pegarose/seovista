import type { PublishedInsightListRow } from "@seovista/worker";

export interface PublishedInsightsReader {
  getPublishedInsights(): Promise<PublishedInsightListRow[]>;
}

export interface PublishedInsightsResult {
  insights: PublishedInsightListRow[];
  unavailable: boolean;
}

export async function readPublishedInsights(
  reader: PublishedInsightsReader,
): Promise<PublishedInsightsResult> {
  try {
    return {
      insights: await reader.getPublishedInsights(),
      unavailable: false,
    };
  } catch {
    return { insights: [], unavailable: true };
  }
}
