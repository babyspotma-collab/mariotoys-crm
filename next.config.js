/** @type {import('next').NextConfig} */

// En-têtes de sécurité envoyés sur toutes les pages.
// CSP : scripts et styles du site uniquement ('unsafe-inline' requis par les
// scripts de démarrage de Next.js sans nonce) ; images du site, de Shopify
// (cdn.shopify.com) et de Vercel Blob ; envoi direct des photos vers Vercel
// Blob (vercel.com/api/blob) ; aucune page du CRM affichable dans un cadre.
const isDev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://cdn.shopify.com https://*.blob.vercel-storage.com",
  "media-src 'self' blob: https://*.blob.vercel-storage.com",
  "font-src 'self' data:",
  `connect-src 'self' https://vercel.com https://*.blob.vercel-storage.com${isDev ? " ws: http://localhost:*" : ""}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig = {
  poweredByHeader: false,
  experimental: {
    // Importe seulement les icônes utilisées (sinon ~6000 modules en dev).
    optimizePackageImports: ["@phosphor-icons/react", "@phosphor-icons/react/dist/ssr"],
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "cdn.shopify.com" }],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

module.exports = nextConfig;
