"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowClockwise, DownloadSimple, FileZip } from "@phosphor-icons/react/dist/ssr";
import Pill, { type PillTone } from "@/components/Pill";
import { angleLabel } from "@/lib/creative-angles";
import { regenerateImage } from "../actions";

type ImageRow = {
  id: string;
  angleKey: string;
  position: number;
  status: string;
  errorMessage: string | null;
  imageUrl: string | null;
};

const IMAGE_PILL: Record<string, { tone: PillTone; label: string }> = {
  EN_ATTENTE: { tone: "gray", label: "En attente" },
  EN_COURS: { tone: "blue", label: "En cours" },
  TERMINEE: { tone: "green", label: "Terminée" },
  ECHEC: { tone: "red", label: "Échec" },
  IGNOREE: { tone: "amber", label: "Ignorée" },
};

const POLL_MS = 5000;

function slug(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "creative"
  );
}

function extensionOf(url: string): string {
  const m = new URL(url).pathname.match(/\.(png|jpe?g|webp)$/i);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "png";
}

function saveBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

export default function CreativeResults({
  requestId,
  productName,
  sourcePhotoUrl,
  initialStatus,
  initialImages,
}: {
  requestId: string;
  productName: string;
  sourcePhotoUrl: string;
  initialStatus: string;
  initialImages: ImageRow[];
}) {
  const [images, setImages] = useState(initialImages);
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/creatives/${requestId}/status`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setStatus(data.status);
      setImages(data.images);
    } catch {
      // Réseau coupé : on garde l'affichage actuel.
    }
  }, [requestId]);

  // Rafraîchissement automatique tant que l'onglet est visible.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const done = images.filter((i) => i.status === "TERMINEE" && i.imageUrl);

  async function download(img: ImageRow) {
    if (!img.imageUrl) return;
    setError(null);
    const name = `${slug(productName)}-${img.angleKey}.${extensionOf(img.imageUrl)}`;
    try {
      const res = await fetch(img.imageUrl);
      if (!res.ok) throw new Error(String(res.status));
      saveBlob(await res.blob(), name);
    } catch {
      // Repli : ouverture directe (l'utilisateur peut enregistrer à la main).
      window.open(img.imageUrl, "_blank", "noopener");
    }
  }

  async function downloadZip() {
    setError(null);
    setZipping(true);
    try {
      // fflate chargé à la demande : inutile pour afficher la page.
      const { zipSync } = await import("fflate");
      const files: Record<string, Uint8Array> = {};
      for (const img of done) {
        const res = await fetch(img.imageUrl!);
        if (!res.ok) throw new Error(`Téléchargement impossible (${res.status})`);
        const name = `${String(img.position).padStart(2, "0")}-${img.angleKey}.${extensionOf(img.imageUrl!)}`;
        files[name] = new Uint8Array(await res.arrayBuffer());
      }
      // Images déjà compressées (PNG/JPEG/WebP) : niveau 0, ZIP instantané.
      const zip = zipSync(files, { level: 0 });
      saveBlob(new Blob([zip], { type: "application/zip" }), `${slug(productName)}-creatives.zip`);
    } catch (e) {
      setError(`ZIP impossible : ${(e as Error).message}`);
    } finally {
      setZipping(false);
    }
  }

  async function regenerate(img: ImageRow) {
    setError(null);
    const result = await regenerateImage(img.id);
    if (result.error) setError(result.error);
    await refresh();
  }

  const globalPill = IMAGE_PILL[status] ?? {
    tone: status === "PARTIELLE" ? ("amber" as const) : ("gray" as const),
    label: status === "PARTIELLE" ? "Partielle" : status,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2.5">
          <Pill tone={globalPill.tone}>{globalPill.label}</Pill>
          <span className="text-[13px] tabular-nums text-muted">
            {done.length}/{images.filter((i) => i.status !== "IGNOREE").length} images
          </span>
        </div>
        <button
          type="button"
          onClick={downloadZip}
          disabled={done.length === 0 || zipping}
          className="btn-secondary w-full md:w-auto"
        >
          <FileZip size={18} aria-hidden="true" />
          {zipping ? "Préparation…" : "Tout télécharger (ZIP)"}
        </button>
      </div>

      {error && <p className="alert-error">{error}</p>}

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {images.map((img) => {
          const pill = IMAGE_PILL[img.status] ?? { tone: "gray" as const, label: img.status };
          const busy = img.status === "EN_ATTENTE" || img.status === "EN_COURS";
          return (
            <li key={img.id} className="card flex flex-col overflow-hidden">
              <div className="relative aspect-[4/5] w-full bg-cream">
                {img.imageUrl ? (
                  <img
                    src={img.imageUrl}
                    alt={`${angleLabel(img.angleKey)} — ${productName}`}
                    loading="lazy"
                    className={`h-full w-full object-cover ${busy ? "opacity-40" : ""}`}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-muted">
                    {img.status === "IGNOREE"
                      ? img.errorMessage ?? "Angle ignoré"
                      : img.status === "ECHEC"
                        ? img.errorMessage ?? "Échec de génération"
                        : img.status === "EN_COURS"
                          ? "Génération en cours…"
                          : "En attente du programme local"}
                  </div>
                )}
                {img.imageUrl && busy && (
                  <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm font-medium text-ink">
                    {img.status === "EN_COURS" ? "Régénération en cours…" : "Régénération en attente"}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2.5 p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                  <span className="min-w-0 truncate text-sm font-medium">
                    {img.position}. {angleLabel(img.angleKey)}
                  </span>
                  <Pill tone={pill.tone}>{pill.label}</Pill>
                </div>
                {img.status === "ECHEC" && img.imageUrl && img.errorMessage && (
                  <p className="text-xs text-pill-red-fg">{img.errorMessage}</p>
                )}
                {/* flex-wrap + largeur minimale : sur une carte étroite les deux
                    boutons passent l'un sous l'autre au lieu d'être coupés. */}
                {img.status !== "IGNOREE" && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => download(img)}
                      disabled={!img.imageUrl}
                      className="btn-secondary h-10 min-w-[9.5rem] flex-1 text-[13px]"
                    >
                      <DownloadSimple size={16} aria-hidden="true" />
                      Télécharger
                    </button>
                    <button
                      type="button"
                      onClick={() => regenerate(img)}
                      disabled={busy}
                      className="btn-ghost h-10 min-w-[9.5rem] flex-1 text-[13px]"
                    >
                      <ArrowClockwise size={16} aria-hidden="true" />
                      Régénérer
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <details className="text-[13px] text-muted">
        <summary className="cursor-pointer">Photo source</summary>
        <img src={sourcePhotoUrl} alt="Photo source" className="mt-2 h-32 w-32 rounded-[10px] border border-line-soft object-contain" />
      </details>
    </div>
  );
}
