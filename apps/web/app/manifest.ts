import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SeoVista",
    short_name: "SeoVista",
    description: "GEO and search visibility intelligence by SeoVista.",
    start_url: "/",
    display: "standalone",
    background_color: "#FCFBF7",
    theme_color: "#0A1017",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
