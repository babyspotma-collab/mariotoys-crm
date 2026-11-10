"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ProductSuggestion } from "@/lib/shopify-admin";
import { formatDh } from "@/lib/format";

// Champ "Nom de l'article" : le texte reste libre, et dès 2 lettres des
// propositions du catalogue Shopify apparaissent (8 au maximum). Choisir une
// proposition reprend son nom exact et son prix.
export default function ProductPicker({
  value,
  onChange,
  onPick,
}: {
  value: string;
  onChange: (title: string) => void;
  onPick: (product: ProductSuggestion) => void;
}) {
  const listId = useId();
  const [results, setResults] = useState<ProductSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const typed = useRef(false); // recherche seulement après une frappe, pas au chargement

  useEffect(() => {
    const q = value.trim();
    if (!typed.current) return;
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { products: ProductSuggestion[] };
        setResults(data.products);
        setError(false);
        setActive(-1);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setResults([]);
        setError(true);
      }
      setLoading(false);
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [value]);

  // Prépare le catalogue côté serveur dès l'ouverture du formulaire : la
  // première recherche est alors instantanée.
  useEffect(() => {
    fetch("/api/products/search?warm=1").catch(() => {});
  }, []);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function pick(p: ProductSuggestion) {
    onPick(p);
    setOpen(false);
    setResults([]);
    typed.current = false;
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") return setOpen(false);
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a <= 0 ? results.length - 1 : a - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault(); // choisit la proposition au lieu d'envoyer le formulaire
      pick(results[active]);
    }
  }

  const showPanel = open && value.trim().length >= 2 && (loading || error || results.length > 0 || typed.current);

  return (
    <div ref={boxRef} className="relative col-span-3 md:col-span-1">
      <input
        value={value}
        onChange={(e) => {
          typed.current = true;
          setOpen(true);
          onChange(e.target.value);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        required
        autoComplete="off"
        aria-label="Nom de l'article"
        placeholder="Nom de l'article"
        className="input w-full"
      />
      {showPanel && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-[10px] border border-line bg-white py-1 shadow-lg"
        >
          {results.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm ${i === active ? "bg-cream" : ""}`}
            >
              {p.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
              ) : (
                <span className="h-9 w-9 shrink-0 rounded-md bg-cream-dark" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1 truncate">
                {p.title}
                {p.status !== "ACTIVE" && (
                  <span className="ml-2 rounded bg-cream-dark px-1.5 py-0.5 text-[11px] font-medium text-muted">
                    {p.status === "DRAFT" ? "brouillon" : "archivé"}
                  </span>
                )}
              </span>
              <span className="shrink-0 tabular-nums text-muted">{formatDh(p.price)}</span>
            </li>
          ))}
          {results.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted">
              {loading ? "Recherche…" : error ? "Catalogue Shopify indisponible — tu peux saisir le nom à la main." : "Aucun produit trouvé — le nom saisi sera utilisé tel quel."}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
