import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The repo has multiple lockfiles (backend + frontend) — pin the workspace root to this app directory.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
