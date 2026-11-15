// O Next.js só serve o mockup estático de public/ e faz a ponte com o FastAPI.
// API_URL é lida no servidor (sem NEXT_PUBLIC_): o navegador só vê caminhos relativos /api/...
const API_URL = (process.env.API_URL || "http://localhost:8000").replace(/\/$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/index.html" }],
      afterFiles: [
        // JSON e imagens (/api/static/nisar/...) do FastAPI
        { source: "/api/:path*", destination: `${API_URL}/api/:path*` },
      ],
    };
  },
};

module.exports = nextConfig;
