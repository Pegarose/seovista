import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FormShell } from "@/components/form-pages/form-shell";
import { FormField } from "@/components/form-pages/form-field";
import { FormErrorNote } from "@/components/form-pages/form-error-note";
import { SubmitButton } from "@/components/form-pages/submit-button";
import { fieldClass, selectFieldClass } from "@/components/form-pages/field-class";
import { fieldErrorProps } from "@/components/form-pages";

const RETIRED_TOKEN_RE = /slate-|gray-|indigo-|blue-|red-|green-|amber-|emerald-|sky-|rose-|shadow-/;

function countTag(markup: string, tag: string): number {
  const re = new RegExp(`<${tag}[\\s>]`, "g");
  return (markup.match(re) ?? []).length;
}

describe("FormShell", () => {
  it("renders exactly one main + one h1 with eyebrow, title and helper", () => {
    const markup = renderToStaticMarkup(
      <FormShell title="GEO Readiness Checker" helper="Helper copy.">
        <p>body</p>
      </FormShell>,
    );
    expect(countTag(markup, "main")).toBe(1);
    expect(markup).toMatch(/<main[^>]*id="main"/);
    expect(countTag(markup, "h1")).toBe(1);
    expect(markup).toContain(">GEO Readiness Checker</h1>");
    expect(markup).toContain("Seovista / Instruments");
    expect(markup).toContain("Helper copy.");
    expect(markup).toContain(">body</p>");
  });

  it("renders no retired color tokens", () => {
    const markup = renderToStaticMarkup(
      <FormShell title="T">
        <p>body</p>
      </FormShell>,
    );
    expect(markup).not.toMatch(RETIRED_TOKEN_RE);
  });

  it("omits the helper when not provided", () => {
    const markup = renderToStaticMarkup(<FormShell title="T">x</FormShell>);
    expect(markup).not.toContain("<p");
  });
});

describe("FormField", () => {
  it("binds label to the control id and renders the error with role=alert", () => {
    const markup = renderToStaticMarkup(
      <FormField id="domain" label="Domain URL" error="Required">
        <input id="domain" name="domain" />
      </FormField>,
    );
    expect(markup).toContain('<label for="domain"');
    expect(markup).toContain("Domain URL");
    expect(markup).toMatch(/role="alert"[^>]*>Required</);
    expect(markup).not.toMatch(RETIRED_TOKEN_RE);
  });

  it("renders no error element when error is undefined", () => {
    const markup = renderToStaticMarkup(
      <FormField id="d" label="D">
        <input id="d" />
      </FormField>,
    );
    expect(markup).not.toContain('role="alert"');
  });
});

describe("FormErrorNote", () => {
  it("renders a role=alert note with the message", () => {
    const markup = renderToStaticMarkup(<FormErrorNote message="Bir şeyler ters gitti" />);
    expect(markup).toMatch(/role="alert"/);
    expect(markup).toContain("Bir şeyler ters gitti");
    expect(markup).not.toMatch(RETIRED_TOKEN_RE);
  });
});

describe("SubmitButton", () => {
  it("renders the idle label and is enabled", () => {
    const markup = renderToStaticMarkup(
      <SubmitButton pending={false} pendingLabel="Working...">
        Start
      </SubmitButton>,
    );
    expect(markup).toContain(">Start</button>");
    // The brief's idle button carries Tailwind `disabled:` variant classes, so
    // assert the absence of the actual HTML `disabled` attribute instead of the
    // substring (which the class name also contains).
    expect(markup).not.toMatch(/disabled(=|\s)/);
    expect(markup).not.toMatch(RETIRED_TOKEN_RE);
  });

  it("renders the pending label and disabled state", () => {
    const markup = renderToStaticMarkup(
      <SubmitButton pending={true} pendingLabel="Working...">
        Start
      </SubmitButton>,
    );
    expect(markup).toContain(">Working...</button>");
    expect(markup).toContain("disabled");
  });
});

describe("field classes", () => {
  it("expose token-only control classes", () => {
    expect(fieldClass).not.toMatch(RETIRED_TOKEN_RE);
    expect(selectFieldClass).not.toMatch(RETIRED_TOKEN_RE);
    expect(selectFieldClass).toContain("appearance-none");
  });
});

describe("fieldErrorProps", () => {
  it("returns an empty object when no errors are present", () => {
    expect(fieldErrorProps(undefined)).toEqual({});
    expect(fieldErrorProps([])).toEqual({});
  });

  it("joins present errors into a single error string", () => {
    expect(fieldErrorProps(["a", "b"])).toEqual({ error: "a, b" });
  });
});
