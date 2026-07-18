import * as React from 'react';

export interface ParagraphBlockProps {
  data: {
    text: string;
  };
}

export function ParagraphBlock({ data }: ParagraphBlockProps) {
  return (
    <p className="mb-4 text-base leading-relaxed text-gray-800 dark:text-gray-200">
      {data.text}
    </p>
  );
}
