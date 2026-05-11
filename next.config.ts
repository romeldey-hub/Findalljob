import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "mammoth", "canvas", "razorpay"],

  async redirects() {
    return [
      // Permanently redirect non-www to www (handles both http and https)
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'findalljob.com' }],
        destination: 'https://www.findalljob.com/:path*',
        permanent: true,
      },
      // Short-slug aliases → canonical SEO pages
      { source: '/resume-optimizer', destination: '/ai-resume-optimizer', permanent: true },
      { source: '/job-matching',     destination: '/resume-job-matching',  permanent: true },
      { source: '/mock-interview',   destination: '/ai-mock-interview',    permanent: true },
    ]
  },
};

export default nextConfig;
