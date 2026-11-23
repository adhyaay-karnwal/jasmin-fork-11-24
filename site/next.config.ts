import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static site: `next build` writes plain HTML to out/ (deployed to GitHub Pages).
  output: "export",
  // Write /docs/index.html instead of /docs.html so every static host serves /docs.
  trailingSlash: true,
  // Project pages live under /<repo>; set by the Pages workflow, empty locally.
  basePath: process.env.PAGES_BASE_PATH || "",
  // Plain <img> tags in public/ need the prefix too.
  env: { NEXT_PUBLIC_BASE_PATH: process.env.PAGES_BASE_PATH || "" },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
