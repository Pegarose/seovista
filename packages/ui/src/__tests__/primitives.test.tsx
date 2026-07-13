import { describe, it, expect } from "vitest";
import { Container, Section, Link, Button, Card } from "../index";

describe("@seovista/ui primitives", () => {
  it("exports all primitive components", () => {
    expect(Container).toBeTypeOf("function");
    expect(Section).toBeTypeOf("function");
    expect(Link).toBeTypeOf("function");
    expect(Button).toBeTypeOf("function");
    expect(Card).toBeTypeOf("function");
  });
});
