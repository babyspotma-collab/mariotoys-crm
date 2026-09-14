import crypto from "crypto";

// Vérifie la signature HMAC-SHA256 d'un webhook Shopify (header
// X-Shopify-Hmac-Sha256), calculée avec le client secret de l'app
// (SHOPIFY_CLIENT_SECRET).
export function verifyShopifyWebhook(rawBody: string, hmacHeader: string | null): boolean {
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret || !hmacHeader) return false;

  const digest = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");

  const a = Buffer.from(digest);
  const b = Buffer.from(hmacHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
