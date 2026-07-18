import * as React from 'react';

export interface HeadingBlockProps {
  data: {
    text: string;
    level?: 2 | 3 | 4;
  };
}

export function HeadingBlock({ data }: HeadingBlockProps) {
  const level = data.level || 2;
  const HeadingTag = `h${level}` as keyof React.JSX.IntrinsicElements;

  const baseStyles = "font-bold text-gray-900 dark:text-gray-100 mb-4 mt-8";
  
  const sizeStyles = {
    2: "text-2xl",
    3: "text-xl",
    4: "text-lg",
  };

  return (
    <HeadingTag className={`${baseStyles} ${sizeStyles[level as keyof typeof sizeStyles]}`}>
      {data.text}
    </HeadingTag>
  );
}
