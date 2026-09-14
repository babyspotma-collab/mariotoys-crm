// Le store Vercel Blob (mediva-crm-app-blob) est configuré en accès
// PRIVÉ : les URLs renvoyées par put() ne sont pas publiquement
// accessibles (https://vercel.com/docs/vercel-blob/private-storage).
// Deux façons différentes de lire un blob privé selon qui doit y
// accéder :
//   - notre propre serveur (aperçu photo, lecture par Gemini) -> get()
//   - un tiers externe qui doit le récupérer lui-même (Shopify, pour
//     importer l'image du produit) -> URL signée temporaire
//     (issueSignedToken + presignUrl), car on ne peut pas donner notre
//     jeton d'accès à Shopify.

import { get, issueSignedToken, presignUrl } from "@vercel/blob";

export async function readBlob(pathname: string): Promise<{ buffer: Buffer; contentType: string }> {
  const result = await get(pathname, { access: "private" });
  if (!result || result.statusCode !== 200) {
    throw new Error(`Blob introuvable : ${pathname}`);
  }
  const buffer = Buffer.from(await new Response(result.stream).arrayBuffer());
  return { buffer, contentType: result.blob.contentType };
}

// URL valable 5 minutes — largement suffisant pour l'appel Shopify
// productCreateMedia, qui va la récupérer immédiatement après.
export async function presignBlobForExternalFetch(pathname: string): Promise<string> {
  const token = await issueSignedToken({
    pathname,
    operations: ["get"],
    validUntil: Date.now() + 10 * 60 * 1000,
  });
  const { presignedUrl } = await presignUrl(token, {
    operation: "get",
    pathname,
    access: "private",
    validUntil: Date.now() + 5 * 60 * 1000,
  });
  return presignedUrl;
}
