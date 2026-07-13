import type { SchemaGraph } from "@seovista/schema";

export interface JsonLdProps {
  readonly graph: SchemaGraph;
}

export function JsonLd({ graph }: JsonLdProps): React.ReactElement {
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
