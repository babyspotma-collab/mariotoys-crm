"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, X } from "@phosphor-icons/react/dist/ssr";
import { addCampaignLink, removeCampaignLink, searchTargets, setCampaignScope, type TargetHit } from "../actions";

export type LinkChip = { id: string; type: string; title: string };
export type Suggestion = { type: "PRODUCT" | "COLLECTION"; id: string; title: string };

// Association d'une campagne Meta, un seul type à la fois : produits / collections
// (retirer, accepter une suggestion, chercher dans le catalogue Shopify), « Tout le
// site » ou « Frais généraux ». Choisir un type remplace les autres associations.
export default function CampaignTargets({ campaignId, links, suggestions }: { campaignId: string; links: LinkChip[]; suggestions: Suggestion[] }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<TargetHit[]>([]);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => start(async () => setHits(await searchTargets(q))), 250);
    return () => clearTimeout(t);
  }, [q]);

  const add = (t: Pick<TargetHit, "type" | "id" | "title">) =>
    start(async () => {
      await addCampaignLink(campaignId, t);
      setQ("");
      setOpen(false);
    });

  const scope = links.some((l) => l.type === "OVERHEAD") ? "OVERHEAD" : links.some((l) => l.type === "SITE") ? "SITE" : null;
  const chipTone = (type: string) =>
    type === "SITE" ? "bg-pill-green-bg text-pill-green-fg" : type === "OVERHEAD" ? "bg-cream-dark text-body" : "bg-pill-blue-bg text-pill-blue-fg";
  const scopeButton = (value: "SITE" | "OVERHEAD", label: string, title: string) =>
    scope === value ? null : (
      <button
        type="button"
        disabled={pending}
        title={title}
        onClick={() => start(() => setCampaignScope(campaignId, value))}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-line px-2 text-xs font-medium text-ink hover:bg-cream"
      >
        {label}
      </button>
    );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {links.map((l) => (
          <span key={l.id} className={`inline-flex h-7 max-w-full items-center gap-1 rounded-md pl-2 pr-1 text-xs font-medium ${chipTone(l.type)}`}>
            <span className="truncate">{l.type === "COLLECTION" ? `Collection : ${l.title}` : l.title}</span>
            <button
              type="button"
              disabled={pending}
              onClick={() => start(() => removeCampaignLink(l.id))}
              aria-label={`Retirer ${l.title}`}
              className="rounded p-0.5 hover:bg-white/60"
            >
              <X size={12} aria-hidden="true" />
            </button>
          </span>
        ))}
        {suggestions.map((s) => (
          <button
            key={`${s.type}${s.id}`}
            type="button"
            disabled={pending}
            onClick={() => add(s)}
            className="inline-flex h-7 max-w-full items-center gap-1 rounded-md border border-dashed border-line-dashed px-2 text-xs text-body hover:bg-cream"
            title="Suggestion d'après le nom de la campagne"
          >
            <Plus size={12} aria-hidden="true" />
            <span className="truncate">{s.type === "COLLECTION" ? `Collection : ${s.title}` : s.title}</span>
          </button>
        ))}
        <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-ink hover:bg-cream">
          <Plus size={12} aria-hidden="true" />
          Associer
        </button>
        {scopeButton("SITE", "Tout le site", "Dépense répartie sur tous les produits vendus, au prorata de leur CA")}
        {scopeButton("OVERHEAD", "Frais généraux", "Notoriété, magasin : dépense déduite du bénéfice global, attribuée à aucun produit")}
      </div>
      {open && scope && (
        <p className="text-xs text-muted">Associer un produit ou une collection remplacera « {scope === "SITE" ? "Tout le site" : "Frais généraux"} ».</p>
      )}
      {open && (
        <div className="flex flex-col gap-1.5">
          <input
            autoFocus
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Produit ou collection Shopify"
            className="input"
            aria-label="Rechercher un produit ou une collection"
          />
          {q.trim().length >= 2 && (
            <ul className="max-h-64 overflow-y-auto rounded-[10px] border border-line">
              {hits.length === 0 ? (
                <li className="px-3 py-2 text-xs text-muted">{pending ? "Recherche…" : "Rien trouvé"}</li>
              ) : (
                hits.map((h) => (
                  <li key={`${h.type}${h.id}`}>
                    <button type="button" disabled={pending} onClick={() => add(h)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-cream">
                      {h.imageUrl ? (
                        <img src={`${h.imageUrl}${h.imageUrl.includes("?") ? "&" : "?"}width=64`} alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-md object-cover" />
                      ) : (
                        <span className="h-8 w-8 shrink-0 rounded-md bg-cream-dark" aria-hidden="true" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{h.title}</span>
                        <span className="block text-xs text-muted">{h.detail}</span>
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
