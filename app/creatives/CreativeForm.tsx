"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { uploadPresigned } from "@vercel/blob/client";
import { ImageSquare } from "@phosphor-icons/react/dist/ssr";
import { HOOK_MAX_WORDS, buildAngles, buildFields, cleanText, countWords, describeHook } from "@/lib/creative-angles";
import { MAX_SOURCE_PHOTO_BYTES, SOURCE_PHOTO_TYPES, UPLOAD_PATH_PREFIX } from "@/lib/creative-upload";
import { createCreativeRequest, requestHookSuggestions } from "./actions";

type Photo = { url: string; filename: string };

// Suggestions d'accroches : proposées à la demande (clic), jamais appliquées
// toutes seules. L'utilisateur en choisit une, la modifie, ou écrit la sienne.
type Suggestions = { status: "idle" | "loading" | "ready" | "error"; hooks: string[]; message: string | null };
const NO_SUGGESTIONS: Suggestions = { status: "idle", hooks: [], message: null };
const SUGGESTION_TIMEOUT_MS = 150_000;

const SOURCE_LABEL = {
  accroche: "",
  point_fort_1: "point fort 1",
  nom_produit: "nom du produit",
} as const;

// Étape 1 : dépôt de la photo (envoi direct vers Blob). Étape 2 : formulaire,
// puis "Générer" crée la demande — rien n'est lancé avant ce clic.
export default function CreativeForm() {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const [productName, setProductName] = useState("");
  const [hook, setHook] = useState("");
  const [pf1, setPf1] = useState("");
  const [pf2, setPf2] = useState("");
  const [pf3, setPf3] = useState("");
  const [price, setPrice] = useState("");
  const [offerLine, setOfferLine] = useState("");

  const [suggest, setSuggest] = useState<Suggestions>(NO_SUGGESTIONS);
  // Jeton de la recherche en cours : annulée si on change de photo ou quitte la page.
  const suggestToken = useRef<{ cancelled: boolean } | null>(null);
  useEffect(() => () => void (suggestToken.current && (suggestToken.current.cancelled = true)), []);

  // Mêmes règles que le serveur : prévient des angles qui seront ignorés et du
  // titre qui sera utilisé si l'accroche reste vide.
  const fields = useMemo(
    () => buildFields({ productName, hook, pointFort1: pf1, pointFort2: pf2, pointFort3: pf3, price, offerLine }),
    [productName, hook, pf1, pf2, pf3, price, offerLine]
  );
  const skipped = useMemo(() => buildAngles(fields).filter((a) => a.skipReason), [fields]);
  const hookInfo = useMemo(() => describeHook(fields), [fields]);
  const hookWords = countWords(cleanText(hook, 60));

  async function suggestHooks() {
    if (!photo || !productName.trim()) return;
    if (suggestToken.current) suggestToken.current.cancelled = true;
    const token = { cancelled: false };
    suggestToken.current = token;
    setSuggest({ status: "loading", hooks: [], message: null });

    const created = await requestHookSuggestions({ photoUrl: photo.url, productName });
    if (token.cancelled) return;
    if (!created.id) {
      setSuggest({ status: "error", hooks: [], message: created.error });
      return;
    }
    const startedAt = Date.now();
    while (!token.cancelled) {
      await new Promise((r) => setTimeout(r, 2000));
      if (token.cancelled) return;
      if (Date.now() - startedAt > SUGGESTION_TIMEOUT_MS) {
        setSuggest({
          status: "error",
          hooks: [],
          message: "Le programme local ne répond pas. Vérifiez qu'il est lancé (voir le bandeau en haut de la page).",
        });
        return;
      }
      try {
        const res = await fetch(`/api/creatives/hooks/${created.id}`, { cache: "no-store" });
        if (!res.ok) continue;
        const data = (await res.json()) as { status: string; hooks: string[]; errorMessage: string | null };
        if (data.status === "TERMINEE") {
          setSuggest({ status: "ready", hooks: data.hooks, message: null });
          return;
        }
        if (data.status === "ECHEC") {
          setSuggest({ status: "error", hooks: [], message: data.errorMessage ?? "La suggestion a échoué." });
          return;
        }
      } catch {
        // Réseau coupé un instant : on réessaie au prochain tour.
      }
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!SOURCE_PHOTO_TYPES.includes(file.type)) {
      setError("Format non accepté : utilisez une photo JPG, PNG ou WebP.");
      return;
    }
    if (file.size > MAX_SOURCE_PHOTO_BYTES) {
      setError("Photo trop lourde (10 Mo maximum).");
      return;
    }
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^\w.-]+/g, "_").slice(-80) || "photo";
      const blob = await uploadPresigned(`${UPLOAD_PATH_PREFIX}${safeName}`, file, {
        access: "public",
        handleUploadUrl: "/api/creatives/upload",
        contentType: file.type,
      });
      setPhoto({ url: blob.url, filename: file.name });
    } catch (e) {
      setError(`Envoi de la photo impossible : ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    if (!photo) return;
    setError(null);
    startTransition(async () => {
      const result = await createCreativeRequest({
        photoUrl: photo.url,
        filename: photo.filename,
        productName,
        hook,
        pointFort1: pf1,
        pointFort2: pf2,
        pointFort3: pf3,
        price,
        offerLine,
      });
      // En cas de succès l'action redirige : on n'arrive ici qu'en cas d'erreur.
      if (result?.error) setError(result.error);
    });
  }

  if (!photo) {
    return (
      <div className="flex flex-col gap-3">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFile(e.dataTransfer.files[0]);
          }}
          className={`flex flex-col items-center gap-4 rounded-[14px] border border-dashed p-6 text-center transition-colors md:flex-row md:gap-5 md:p-7 md:text-left ${
            dragging ? "border-ink bg-cream-dark" : "border-line-dashed bg-white"
          }`}
        >
          <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cream-dark text-body md:flex">
            <ImageSquare size={24} aria-hidden="true" />
          </div>
          <div className="flex flex-grow flex-col gap-1">
            <div className="text-[15px] font-semibold">
              <span className="md:hidden">Ajouter une photo produit</span>
              <span className="hidden md:inline">Glissez une photo produit ici</span>
            </div>
            <div className="text-[13px] text-muted">Photo sur fond blanc · JPG, PNG ou WebP · 10 Mo maximum.</div>
          </div>
          {uploading && <span className="text-[13px] font-medium text-muted">Envoi en cours…</span>}
          <label
            htmlFor="creative-photo"
            className={`btn-primary w-full cursor-pointer md:w-auto ${uploading ? "pointer-events-none opacity-50" : ""}`}
          >
            Choisir une photo
          </label>
          <input
            ref={inputRef}
            id="creative-photo"
            type="file"
            accept={SOURCE_PHOTO_TYPES.join(",")}
            className="sr-only"
            onChange={(e) => {
              handleFile(e.currentTarget.files?.[0]);
              e.currentTarget.value = "";
            }}
          />
        </div>
        {error && <p className="alert-error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="card flex flex-col gap-5 p-4 md:flex-row md:gap-6 md:p-5">
      <div className="flex shrink-0 flex-col gap-2 md:w-[200px]">
        <img
          src={photo.url}
          alt="Photo produit déposée"
          className="aspect-square w-full rounded-[10px] border border-line-soft bg-cream object-contain"
        />
        <button
          type="button"
          onClick={() => {
            if (suggestToken.current) suggestToken.current.cancelled = true;
            setSuggest(NO_SUGGESTIONS);
            setPhoto(null);
          }}
          className="btn-ghost h-9 text-[13px]"
          disabled={pending}
        >
          Changer de photo
        </button>
      </div>

      <form
        className="flex min-w-0 flex-grow flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div>
          <label htmlFor="c-name" className="label">
            Nom du produit <span className="text-accent">*</span>
          </label>
          <input
            id="c-name"
            className="input"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            maxLength={80}
            required
            placeholder="ex : Circuit Hot Wheels Tornado"
          />
        </div>

        <div>
          <label htmlFor="c-hook" className="label">
            Accroche <span className="font-normal text-muted">(facultatif)</span>
          </label>
          <input
            id="c-hook"
            className="input"
            value={hook}
            onChange={(e) => setHook(e.target.value)}
            maxLength={60}
            placeholder="ex : Fini les couches ?"
          />
          {hookWords > HOOK_MAX_WORDS ? (
            <p className="hint text-pill-amber-fg">
              {hookWords} mots : au-delà de {HOOK_MAX_WORDS}, Gemini risque de raccourcir ou déformer le titre.
            </p>
          ) : hook.trim() ? (
            <p className="hint">Écrite telle quelle, une seule fois, dans les images Problème, Plaisir et Cadeau.</p>
          ) : (
            <p className="hint">
              Une phrase courte ({HOOK_MAX_WORDS} mots maximum). Sans accroche, le titre des images sera «&nbsp;
              {hookInfo.text || "…"}&nbsp;»{hookInfo.text ? ` (${SOURCE_LABEL[hookInfo.source]})` : ""}.
            </p>
          )}

          <button
            type="button"
            onClick={suggestHooks}
            disabled={!productName.trim() || suggest.status === "loading" || pending}
            className="btn-secondary mt-2 h-10 w-full text-[13px] md:w-auto"
          >
            {suggest.status === "loading" ? "Analyse de la photo…" : "Suggérer 3 accroches"}
          </button>

          {suggest.status === "ready" && (
            <div className="mt-2 flex flex-col gap-2">
              <p className="hint !mt-0">Propositions : touchez-en une pour la placer dans le champ, puis modifiez-la si besoin.</p>
              {suggest.hooks.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHook(h)}
                  className={`rounded-[10px] border px-3.5 py-2.5 text-left text-sm transition-colors ${
                    hook === h ? "border-ink bg-cream-dark font-medium" : "border-line-input bg-white hover:bg-cream"
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>
          )}
          {suggest.status === "error" && <p className="alert-error mt-2">{suggest.message}</p>}
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="label">Points forts (jusqu&apos;à 3)</legend>
          <input className="input" aria-label="Point fort 1" value={pf1} onChange={(e) => setPf1(e.target.value)} maxLength={40} placeholder="Point fort 1" />
          <input className="input" aria-label="Point fort 2" value={pf2} onChange={(e) => setPf2(e.target.value)} maxLength={40} placeholder="Point fort 2" />
          <input className="input" aria-label="Point fort 3" value={pf3} onChange={(e) => setPf3(e.target.value)} maxLength={40} placeholder="Point fort 3" />
          <p className="hint -mt-1">Courts : ils seront écrits tels quels dans l&apos;image.</p>
        </fieldset>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="c-price" className="label">
              Prix (MAD)
            </label>
            <input
              id="c-price"
              className="input"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
              maxLength={10}
              placeholder="ex : 199"
            />
          </div>
          <div>
            <label htmlFor="c-offer" className="label">
              Ligne offre / livraison
            </label>
            <input
              id="c-offer"
              className="input"
              value={offerLine}
              onChange={(e) => setOfferLine(e.target.value)}
              maxLength={80}
              placeholder="ex : Livraison gratuite"
            />
          </div>
        </div>

        {skipped.length > 0 && (
          <div className="rounded-[10px] bg-pill-amber-bg px-3.5 py-3 text-[13px] text-pill-amber-fg">
            <p className="font-semibold">
              {skipped.length === 1 ? "1 angle sera ignoré" : `${skipped.length} angles seront ignorés`}
            </p>
            <ul className="mt-1 list-disc pl-4">
              {skipped.map((a) => (
                <li key={a.key}>
                  « {a.label} » : {a.skipReason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="alert-error">{error}</p>}

        <button type="submit" className="btn-primary w-full md:w-auto md:self-start" disabled={pending || !productName.trim()}>
          {pending ? "Création…" : "Générer"}
        </button>
      </form>
    </div>
  );
}
