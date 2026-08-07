import React from "react";

export interface SchemaGraphNode {
  type?: string;
  [key: string]: unknown;
}

export interface SchemaGraphTreeProps {
  nodes: Record<string, unknown>[];
}

export function SchemaGraphTree({ nodes }: SchemaGraphTreeProps) {
  if (!nodes || nodes.length === 0) {
    return (
      <div className="bg-card p-6 rounded-xl border border-hairline text-center">
        <h3 className="text-lg font-semibold text-ink mb-2">Schema graph tree</h3>
        <p className="text-sm text-muted-ink">
          No parseable Schema.org objects found on this page.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card p-6 rounded-xl border border-hairline space-y-4">
      <div className="flex items-center justify-between border-b border-hairline pb-4">
        <h3 className="text-lg font-semibold text-ink">
          Schema graph tree ({nodes.length} objects)
        </h3>
        <span className="text-xs text-muted-ink font-medium">JSON-LD structure</span>
      </div>

      <div className="space-y-4">
        {nodes.map((node, index) => {
          const type = (node["@type"] as string | undefined) || "Unknown type";
          const id = node["@id"] as string | undefined;

          return (
            <div
              key={index}
              className="bg-paper rounded-lg border border-hairline overflow-hidden text-sm"
            >
              <div className="bg-mineral px-4 py-2 border-b border-hairline font-mono text-xs flex items-center justify-between">
                <span className="font-semibold text-spectral">@type: {type}</span>
                {id && <span className="text-muted-ink truncate max-w-xs">@id: {id}</span>}
              </div>
              <pre className="p-4 overflow-x-auto text-xs font-mono text-ink bg-paper leading-relaxed">
                {JSON.stringify(node, null, 2)}
              </pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}
