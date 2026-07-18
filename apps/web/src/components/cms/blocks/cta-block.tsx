import * as React from 'react';
import Link from 'next/link';

export interface CtaBlockProps {
  data: {
    text: string;
    url: string;
    style?: 'primary' | 'secondary' | 'outline';
  };
}

export function CtaBlock({ data }: CtaBlockProps) {
  const { text, url, style = 'primary' } = data;

  const baseStyles = "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 h-9 px-4 py-2 mt-4 mb-6";
  
  const variantStyles = {
    primary: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
    secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
    outline: "border border-input bg-transparent shadow-sm hover:bg-accent hover:text-accent-foreground",
  };

  const styleClass = variantStyles[style] || variantStyles.primary;

  return (
    <div className="flex">
      <Link href={url} className={`${baseStyles} ${styleClass}`}>
        {text}
      </Link>
    </div>
  );
}
