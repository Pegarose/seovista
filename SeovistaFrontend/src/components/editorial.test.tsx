import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  LedgerSkeleton,
  InstrumentIndexSkeleton,
  LoadingState,
  EmptyState,
  UnavailableState,
  RetryError,
} from "./editorial";

describe("skeleton loading states", () => {
  it("LedgerSkeleton is announced politely and marked busy", () => {
    const { container } = render(<LedgerSkeleton rows={3} />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText(/loading the editorial ledger/i)).toHaveClass(
      "sr-only",
    );
    // Layout-matching: renders the requested number of rows.
    expect(container.querySelectorAll("ul > li")).toHaveLength(3);
  });

  it("InstrumentIndexSkeleton is announced politely and marked busy", () => {
    const { container } = render(<InstrumentIndexSkeleton rows={2} />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText(/loading the instrument index/i)).toHaveClass(
      "sr-only",
    );
    expect(container.querySelectorAll("ul > li")).toHaveLength(2);
  });

  it("LoadingState exposes a title and a11y attrs", () => {
    render(<LoadingState title="Loading ledger" description="Please wait" />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("Loading ledger")).toBeInTheDocument();
    expect(screen.getByText("Please wait")).toBeInTheDocument();
  });
});

describe("empty states", () => {
  it("EmptyState renders title, description and optional action", () => {
    render(
      <EmptyState
        title="Nothing published"
        description="The ledger is empty."
        action={<button type="button">Go home</button>}
      />,
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Nothing published")).toBeInTheDocument();
    expect(screen.getByText("The ledger is empty.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /go home/i })).toBeInTheDocument();
  });

  it("EmptyState omits action when not provided", () => {
    render(<EmptyState title="Empty" description="Nothing to see." />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("unavailable state", () => {
  it("UnavailableState signals backend outage semantics", () => {
    render(
      <UnavailableState
        title="Ledger unavailable"
        description="Backend unreachable."
      />,
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(/^unavailable$/i)).toBeInTheDocument();
    expect(screen.getByText("Ledger unavailable")).toBeInTheDocument();
    expect(screen.getByText("Backend unreachable.")).toBeInTheDocument();
  });
});

describe("error state with retry", () => {
  it("RetryError uses role=alert and shows description", () => {
    render(
      <RetryError
        title="Could not load"
        description="Network error."
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(screen.getByText("Could not load")).toBeInTheDocument();
    expect(screen.getByText("Network error.")).toBeInTheDocument();
    // No retry button when onRetry is not provided.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("RetryError invokes onRetry when the button is clicked", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(
      <RetryError
        title="Failed"
        description="Try again."
        onRetry={onRetry}
        retryLabel="Reload"
      />,
    );
    const button = screen.getByRole("button", { name: /reload/i });
    await user.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("RetryError button is keyboard-accessible (Enter)", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(
      <RetryError title="Failed" description="Try again." onRetry={onRetry} />,
    );
    const button = screen.getByRole("button", { name: /try again/i });
    button.focus();
    expect(button).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
