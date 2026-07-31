// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CrawlerAccessMatrix } from "../crawler-access-matrix";

const crawlers = [
  { userAgent: "OAI-SearchBot", label: "OAI-SearchBot (ChatGPT arama)", category: "ai-search" as const, status: "blocked" as const },
  { userAgent: "GPTBot", label: "GPTBot (OpenAI eğitim)", category: "ai-training" as const, status: "blocked" as const },
  { userAgent: "Googlebot", label: "Googlebot", category: "search" as const, status: "allowed" as const },
];

describe("CrawlerAccessMatrix", () => {
  it("renders status text per bot (not color-only)", () => {
    render(<CrawlerAccessMatrix crawlers={crawlers} />);
    expect(screen.getAllByText("Engelli").length).toBeGreaterThan(0);
    expect(screen.getAllByText("İzinli").length).toBeGreaterThan(0);
  });
  it("marks blocked ai-training bots as a neutral policy choice", () => {
    render(<CrawlerAccessMatrix crawlers={crawlers} />);
    expect(screen.getByText(/politika tercihi/i)).toBeInTheDocument();
  });
  it("renders category group headings", () => {
    render(<CrawlerAccessMatrix crawlers={crawlers} />);
    expect(screen.getByText(/AI Arama/)).toBeInTheDocument();
  });
});
