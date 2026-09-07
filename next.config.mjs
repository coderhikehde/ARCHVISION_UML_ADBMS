/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  output: "standalone",
  // Dev and production builds MUST NOT share a directory: `next dev` and
  // `next build` writing to the same .next corrupts the dev server's chunk
  // cache (vendor-chunks errors, 500s on /api routes). Dev -> .next-dev.
  distDir: process.env.NODE_ENV === "production" ? ".next" : ".next-dev",
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Package profiling: reduce client bundle of heavy ESM libs
    optimizePackageImports: ["lucide-react", "framer-motion", "@xyflow/react"],
    // Prisma/pg run at the Node runtime — don't webpack-bundle them
    serverComponentsExternalPackages: ["pg", "pgpass", "@prisma/client", "@prisma/adapter-pg"],
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  async headers() {
    const headers = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    ];
    if (process.env.NODE_ENV === "production") {
      headers.push({
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          // Next.js inline bootstrap scripts + Monaco/webpack eval at runtime
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
          // Tailwind/Radix/mermaid inline styles
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https://avatars.githubusercontent.com https://lh3.googleusercontent.com",
          "font-src 'self' data: https://fonts.gstatic.com",
          "connect-src 'self'",
          // Monaco web workers are created from blob URLs
          "worker-src 'self' blob:",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "object-src 'none'",
        ].join("; "),
      });
    }
    return [{ source: "/(.*)", headers }];
  },
};

export default nextConfig;