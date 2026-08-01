// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SerpPreviewTool } from "../serp-preview-tool";

describe("SerpPreviewTool", () => {
  it("renders initial values from props into inputs", () => {
    render(<SerpPreviewTool initialTitle="Başlık" initialDescription="Açıklama" initialUrl="https://example.com/sayfa" />);
    expect(screen.getByLabelText(/Sayfa Başlığı/i)).toHaveValue("Başlık");
    expect(screen.getByLabelText(/Meta Açıklama/i)).toHaveValue("Açıklama");
    expect(screen.getByLabelText(/Görüntülenecek URL/i)).toHaveValue("https://example.com/sayfa");
  });

  it("shows truncation warning when title exceeds desktop pixel limit", () => {
    render(<SerpPreviewTool initialTitle={"W".repeat(40)} initialDescription="" initialUrl="" />);
    expect(screen.getAllByText(/kısalt/i).length).toBeGreaterThan(0);
  });

  it("labels pixel measurement as an estimate", () => {
    render(<SerpPreviewTool initialTitle="x" initialDescription="" initialUrl="" />);
    expect(screen.getAllByText(/tahmini/i).length).toBeGreaterThan(0);
  });

  it("share button copies a parametrized URL to clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<SerpPreviewTool initialTitle="Paylaş" initialDescription="Açıklama" initialUrl="https://example.com" />);
    fireEvent.click(screen.getByRole("button", { name: /bağlantıyı kopyala/i }));
    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = writeText.mock.calls[0]?.[0] as string;
    expect(copied).toContain("/tools/serp-preview/?");
    expect(copied).toContain("title=");
  });

  it("falls back to execCommand copy when the clipboard API is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", { value: execCommand, configurable: true, writable: true });
    render(<SerpPreviewTool initialTitle="Paylaş" initialDescription="Açıklama" initialUrl="https://example.com" />);
    fireEvent.click(screen.getByRole("button", { name: /bağlantıyı kopyala/i }));
    await screen.findByText(/kopyalandı/i);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("falls back to execCommand copy when clipboard writeText rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", { value: execCommand, configurable: true, writable: true });
    render(<SerpPreviewTool initialTitle="Paylaş" initialDescription="Açıklama" initialUrl="https://example.com" />);
    fireEvent.click(screen.getByRole("button", { name: /bağlantıyı kopyala/i }));
    await screen.findByText(/kopyalandı/i);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("shows a Turkish error message when every copy method fails", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    const execCommand = vi.fn().mockReturnValue(false);
    Object.defineProperty(document, "execCommand", { value: execCommand, configurable: true, writable: true });
    render(<SerpPreviewTool initialTitle="Paylaş" initialDescription="Açıklama" initialUrl="https://example.com" />);
    fireEvent.click(screen.getByRole("button", { name: /bağlantıyı kopyala/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Kopyalama başarısız");
  });
});
