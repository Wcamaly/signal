import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  // The management screens moved under /manage. Permanent (308): bookmarks
  // and old links land on the new page, query string included
  // (node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/redirects.md).
  async redirects() {
    return [{ source: "/sources", destination: "/manage/sources", permanent: true }];
  },
};

export default nextConfig;
