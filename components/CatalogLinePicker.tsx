"use client";

import { useState } from "react";
import ProductPicker from "@/components/ProductPicker";
import AlbaseetPicker from "@/components/AlbaseetPicker";
import type { CatalogVariant, ProductSuggestion } from "@/lib/shopify-admin";
import { formatDh } from "@/lib/format";

// Choix d'une ligne de commande : un produit du catalogue Shopify puis sa variante
// (choisie d'office quand il n'y en a qu'une), ou, si le produit n'existe pas sur
// Shopify, un article ALBASEET+ (son coût d'achat s'applique à la vente).
// Renvoie null tant que le choix n'est pas complet : une ligne libre est refusée.
export type CatalogPick = { variantId: string | null; albaseetCode: string | null; title: string; price: number };

export default function CatalogLinePicker({ onChange }: { onChange: (pick: CatalogPick | null) => void }) {
  const [mode, setMode] = useState<"shopify" | "albaseet">("shopify");
  const [text, setText] = useState("");
  const [product, setProduct] = useState<{ id: string; title: string } | null>(null);
  const [variants, setVariants] = useState<CatalogVariant[] | null>(null);
  const [variantId, setVariantId] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [article, setArticle] = useState<{ code: string; designation: string } | null>(null);

  const label = (title: string, v: CatalogVariant) => (v.title ? `${title} (variante : ${v.title})` : title);
  const emit = (title: string, v: CatalogVariant | undefined) =>
    onChange(v ? { variantId: v.id, albaseetCode: null, title: label(title, v), price: v.price } : null);

  function reset(next: "shopify" | "albaseet") {
    setMode(next);
    setText("");
    setProduct(null);
    setVariants(null);
    setVariantId("");
    setStatus("idle");
    setArticle(null);
    onChange(null);
  }

  async function pickProduct(p: ProductSuggestion) {
    setText(p.title);
    setProduct({ id: p.id, title: p.title });
    setVariants(null);
    setVariantId("");
    onChange(null);
    setStatus("loading");
    try {
      const res = await fetch(`/api/products/variants?productId=${encodeURIComponent(p.id)}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { productTitle: string; variants: CatalogVariant[] };
      setVariants(data.variants);
      setStatus("idle");
      if (data.variants.length === 1) {
        setVariantId(data.variants[0].id);
        emit(data.productTitle, data.variants[0]);
      }
    } catch {
      setStatus("error");
    }
  }

  const switchLink = (
    <button type="button" onClick={() => reset(mode === "shopify" ? "albaseet" : "shopify")} className="w-fit text-xs text-muted underline underline-offset-2 hover:text-ink">
      {mode === "shopify" ? "Produit absent de Shopify ? Choisir un article ALBASEET+" : "Revenir au catalogue Shopify"}
    </button>
  );

  if (mode === "albaseet") {
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        {article ? (
          <div className="flex items-center gap-2 rounded-[10px] border border-line bg-white px-3 py-2 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block truncate">{article.designation}</span>
              <span className="text-xs text-muted">Article ALBASEET+ · code {article.code}</span>
            </span>
            <button type="button" onClick={() => reset("albaseet")} className="shrink-0 text-xs text-muted underline underline-offset-2">
              Changer
            </button>
          </div>
        ) : (
          <AlbaseetPicker
            onPick={(a) => {
              setArticle({ code: a.code, designation: a.designation });
              onChange({ variantId: null, albaseetCode: a.code, title: a.designation, price: a.prixVente ?? 0 });
            }}
          />
        )}
        {switchLink}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <ProductPicker
        value={text}
        onChange={(t) => {
          setText(t);
          if (product) {
            setProduct(null);
            setVariants(null);
            setVariantId("");
            onChange(null);
          }
        }}
        onPick={pickProduct}
      />
      {product && variants && variants.length > 1 && (
        <select
          value={variantId}
          onChange={(e) => {
            setVariantId(e.target.value);
            emit(product.title, variants.find((v) => v.id === e.target.value));
          }}
          className={`input ${variantId ? "" : "border-accent"}`}
          aria-label="Variante"
          required
        >
          <option value="">Choisir la variante…</option>
          {variants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.title} — {formatDh(v.price)}
            </option>
          ))}
        </select>
      )}
      {status === "loading" && <span className="text-xs text-muted">Chargement des variantes…</span>}
      {status === "error" && <span className="text-xs text-accent">Variantes indisponibles — choisis le produit à nouveau.</span>}
      {!product && text.trim().length > 0 && <span className="text-xs text-muted">Choisis un produit dans la liste.</span>}
      {switchLink}
    </div>
  );
}
