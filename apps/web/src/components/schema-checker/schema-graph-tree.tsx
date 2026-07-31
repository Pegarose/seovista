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
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm text-center">
        <h3 className="text-lg font-semibold text-slate-900 mb-2">Schema Graf Ağacı</h3>
        <p className="text-sm text-slate-500">
          Bu sayfada ayrıştırılabilir Schema.org nesnesi bulunamadı.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <h3 className="text-lg font-semibold text-slate-900">
          Schema Graf Ağacı ({nodes.length} Nesne)
        </h3>
        <span className="text-xs text-slate-500 font-medium">JSON-LD Yapısı</span>
      </div>

      <div className="space-y-4">
        {nodes.map((node, index) => {
          const type = (node["@type"] as string | undefined) || "Bilinmeyen Tip";
          const id = node["@id"] as string | undefined;

          return (
            <div
              key={index}
              className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden text-sm"
            >
              <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 font-mono text-xs flex items-center justify-between">
                <span className="font-semibold text-blue-700">@type: {type}</span>
                {id && <span className="text-slate-500 truncate max-w-xs">@id: {id}</span>}
              </div>
              <pre className="p-4 overflow-x-auto text-xs font-mono text-slate-800 bg-slate-50 leading-relaxed">
                {JSON.stringify(node, null, 2)}
              </pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}
