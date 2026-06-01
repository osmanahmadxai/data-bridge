import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The web app is a pure frontend; all data access goes through the NestJS
  // API. `@relay/core` is consumed for shared types and Zod schemas only.
  transpilePackages: ['@relay/core'],
  // Pin the monorepo root so Next doesn't pick up a stray lockfile elsewhere.
  outputFileTracingRoot: root,
  // Hide the floating Next.js dev indicator badge.
  devIndicators: false,
  // Don't leak the framework in response headers.
  poweredByHeader: false,
};

export default nextConfig;
