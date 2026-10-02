import { NextRequest, NextResponse } from "next/server";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { issueSignedToken } from "@vercel/blob";
import {
  MAX_SOURCE_PHOTO_BYTES,
  SOURCE_PHOTO_TYPES,
  UPLOAD_PATH_PREFIX,
  hasSession,
} from "@/lib/creatives";

export const dynamic = "force-dynamic";

// Délivre l'URL signée qui permet au NAVIGATEUR d'envoyer la photo produit
// directement dans Vercel Blob (sans passer par Vercel : la limite de 4,5 Mo
// par requête empêcherait des photos jusqu'à 10 Mo). Exige la session CRM —
// sans elle personne ne peut obtenir de jeton d'upload.
//
// Variante "presigned" (et non handleUpload) : le projet n'a pas de
// BLOB_READ_WRITE_TOKEN, il s'authentifie auprès de Blob par OIDC
// (BLOB_STORE_ID), que seul issueSignedToken sait utiliser.
export async function POST(req: NextRequest) {
  if (!(await hasSession())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const body = (await req.json()) as HandleUploadPresignedBody;

  try {
    const result = await handleUploadPresigned({
      body,
      request: req,
      getSignedToken: async (pathname) => {
        // Le client choisit le nom : on impose le préfixe et on refuse toute
        // tentative d'écrire ailleurs dans le store.
        if (!pathname.startsWith(UPLOAD_PATH_PREFIX) || pathname.includes("..")) {
          throw new Error("Chemin d'upload non autorisé");
        }
        const validUntil = Date.now() + 10 * 60_000;
        const token = await issueSignedToken({
          pathname,
          operations: ["put"],
          allowedContentTypes: SOURCE_PHOTO_TYPES,
          maximumSizeInBytes: MAX_SOURCE_PHOTO_BYTES,
          validUntil,
        });
        return {
          token,
          urlOptions: {
            validUntil,
            allowedContentTypes: SOURCE_PHOTO_TYPES,
            maximumSizeInBytes: MAX_SOURCE_PHOTO_BYTES,
            addRandomSuffix: true,
          },
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
