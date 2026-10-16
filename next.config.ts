import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The repo has multiple lockfiles (backend + frontend) — pin the workspace root to this app directory.
  turbopack: {
    root: import.meta.dirname,
  },
  // Dev only: Next blocks /_next dev assets for any host other than localhost, so
  // opening the app via 127.0.0.1 serves server HTML that never hydrates — forms
  // still submit (Server Actions work without JS) but toasts, timers etc. are dead.
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;
