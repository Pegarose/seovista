import React from "react";

export interface SerpPreviewProps {
  url: string;
  title: string;
  snippet: string;
  mode?: "serp" | "ai_answer";
}

export function SerpPreview({
  url,
  title,
  snippet,
  mode = "serp",
}: SerpPreviewProps): React.ReactElement {
  let hostname = url;
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = url;
  }

  if (mode === "ai_answer") {
    return (
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-5 shadow-xs transition-all">
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-600 text-white">
            AI Overview Citation Preview
          </span>
          <span className="text-xs text-slate-500 font-mono">{hostname}</span>
        </div>
        <p className="text-sm text-slate-800 leading-relaxed font-normal">
          {snippet}
        </p>
        <div className="mt-3 pt-3 border-t border-indigo-100 flex items-center justify-between text-xs text-indigo-700 font-medium">
          <span>Source: {title}</span>
          <span className="underline cursor-pointer">View Citation Context &rarr;</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs font-sans">
      <div className="text-xs text-slate-600 mb-1 flex items-center gap-1.5 font-mono truncate">
        <span className="w-4 h-4 rounded-full bg-slate-200 inline-block flex-shrink-0" />
        <span>{url}</span>
      </div>
      <h3 className="text-lg font-medium text-blue-700 hover:underline cursor-pointer truncate mb-1">
        {title}
      </h3>
      <p className="text-sm text-slate-600 leading-normal line-clamp-2">
        {snippet}
      </p>
    </div>
  );
}
