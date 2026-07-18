import * as React from 'react';
import { ParagraphBlock } from './blocks/paragraph-block';
import { HeadingBlock } from './blocks/heading-block';
import { CtaBlock } from './blocks/cta-block';

export type BlockData = 
  | { type: 'paragraph'; data: { text: string } }
  | { type: 'heading'; data: { text: string; level?: 2 | 3 | 4 } }
  | { type: 'cta'; data: { text: string; url: string; style?: 'primary' | 'secondary' | 'outline' } }
  | { type: string; data: any };

export interface BlockRendererProps {
  blocks: BlockData[];
}

export function BlockRenderer({ blocks }: BlockRendererProps) {
  if (!blocks || !Array.isArray(blocks)) {
    return null;
  }

  return (
    <div className="cms-block-renderer">
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'paragraph':
            return <ParagraphBlock key={index} data={block.data} />;
          case 'heading':
            return <HeadingBlock key={index} data={block.data} />;
          case 'cta':
            return <CtaBlock key={index} data={block.data} />;
          default:
            // Gracefully ignore unknown block types
            return null;
        }
      })}
    </div>
  );
}
