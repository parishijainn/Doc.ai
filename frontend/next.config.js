/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Use a configurable build directory so `next dev` and `next build`
  // don't fight over the same `.next` folder (can cause missing chunk errors).
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

module.exports = nextConfig;
