
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import {
  LedgerSkeleton,
  InstrumentIndexSkeleton,
  LoadingState,
  EmptyState,
  UnavailableState,
  RetryError,
} from "./editorial";

// axe needs a landmark region; wrap in <main> so region rules pass.
function withMain(ui: React.ReactNode) {
  return <main>{ui}</main>;
}

async function expectNoA11yViolations(container: HTMLElement) {
  const results = await axe(container, {
    rules: {
      // color-contrast requires real rendered colors; jsdom has no layout,
      // so skip and rely on the /design/contrast/ token audit route.
      "color-contrast": { enabled: false },
    },
  });
  expect(results).toHaveNoViolations();
}

describe("editorial a11y (axe-core)", () => {
  it("LedgerSkeleton has no violations and announces politely", async () => {
    const { container } = render(withMain(<LedgerSkeleton rows={3} />));
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-busy", "true");
    await expectNoA11yViolations(container);
  });

  it("InstrumentIndexSkeleton has no violations and announces politely", async () => {
    const { container } = render(withMain(<InstrumentIndexSkeleton rows={3} />));
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-busy", "true");
    await expectNoA11yViolations(container);
  });

  it("LoadingState has no violations and exposes busy status", async () => {
    const { container } = render(
      withMain(<LoadingState title="Loading" description="Please wait." lines={4} />),
    );
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-busy", "true");
    await expectNoA11yViolations(container);
  });

  it("EmptyState has no violations", async () => {
    const { container } = render(
      withMain(<EmptyState title="No items" description="Nothing to display." />),
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("UnavailableState has no violations", async () => {
    const { container } = render(
      withMain(
        <UnavailableState title="Backend unavailable" description="Try again later." />,
      ),
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("RetryError has no violations, uses role=alert, and exposes an accessible button", async () => {
    const onRetry = vi.fn();
    const { container } = render(
      withMain(
        <RetryError
          title="Could not load ledger"
          description="A network error occurred."
          onRetry={onRetry}
          retryLabel="Try again"
        />,
      ),
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: /try again/i });
    expect(button).toHaveAttribute("type", "button");
    await expectNoA11yViolations(container);
  });

  it("RetryError without onRetry still has no violations", async () => {
    const { container } = render(
      withMain(
        <RetryError title="Could not load" description="Please refresh." />,
      ),
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
