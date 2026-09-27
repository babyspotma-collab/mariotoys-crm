/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Importe seulement les icônes utilisées (sinon ~6000 modules en dev).
    optimizePackageImports: ["@phosphor-icons/react", "@phosphor-icons/react/dist/ssr"],
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "cdn.shopify.com" }],
  },
};

module.exports = nextConfig;
