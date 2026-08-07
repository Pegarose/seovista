// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CrawlerAccessMatrix } from "../crawler-access-matrix";

const crawlers = [
  { userAgent: "OAI-SearchBot", label: "OAI-SearchBot (ChatGPT search)", category: "ai-search" as const, status: "blocked" as const },
  { userAgent: "GPTBot", label: "GPTBot (OpenAI training)", category: "ai-training" as const, status: "blocked" as const },
  { userAgent: "Googlebot", label: "Googlebot", category: "search" as const, status: "allowed" as const },
];

describe("CrawlerAccessMatrix", () => {
  it("renders status text per bot (not color-only)", () => {
    render(<CrawlerAccessMatrix crawlers={crawlers} />);
    expect(screen.getAllByText("Blocked").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Allowed").length).toBeGreaterThan(0);
  });
  it("marks blocked ai-training bots as a neutral policy choice", () => {
    render(<CrawlerAccessMatrix crawlers={crawlers} />);
    expect(screen.getByText(/policy choice — not an error/i)).toBeInTheDocument();
  });
  it("renders category group headings", () => {
    render(<CrawlerAccessMatrix crawlers={crawlers} />);
    expect(screen.getByText(/AI search/)).toBeInTheDocument();
  });
});
