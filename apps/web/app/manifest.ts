import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SeoVista",
    short_name: "SeoVista",
    description: "AI visibility and GEO readiness platform",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f172a",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
