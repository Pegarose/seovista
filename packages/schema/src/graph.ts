import type { SchemaGraph, SchemaNode } from "./types";

export function buildGraph(nodes: readonly SchemaNode[]): SchemaGraph {
  return {
    "@context": "https://schema.org",
    "@graph": nodes,
  };
}

export function renderGraph(graph: SchemaGraph): string {
  return JSON.stringify(graph, null, 2);
}
