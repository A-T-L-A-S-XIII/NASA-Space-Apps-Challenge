/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: the public demo needs no server (data comes from public/api/).
  output: "export",
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
