"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createProduct, type ReviewState } from "./actions";
import type { ShopifyCollection } from "@/lib/shopify-admin";

type InitialValues = {
  title: string;
  about: string;
  features: string;
  sizes: string;
  tags: string;
  price: number;
  compareAtPrice: number;
  collectionId: string;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Création…" : "Créer le produit (brouillon Shopify)"}
    </button>
  );
}

export default function ReviewForm({
  draftId,
  collections,
  initialValues,
}: {
  draftId: string;
  collections: ShopifyCollection[];
  initialValues: InitialValues;
}) {
  const action = createProduct.bind(null, draftId);
  const initialState: ReviewState = { error: null };
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5 bg-white border border-line rounded-2xl p-6">
      {state.error && <p className="text-sm text-danger bg-danger/10 rounded-lg p-3">{state.error}</p>}

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="title">
          Titre
        </label>
        <input id="title" name="title" required defaultValue={initialValues.title} className="w-full border border-line rounded-lg px-3 py-2 text-sm" />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="about">
          À propos de cet article
        </label>
        <textarea id="about" name="about" required rows={3} defaultValue={initialValues.about} className="w-full border border-line rounded-lg px-3 py-2 text-sm" />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="features">
          Caractéristiques principales <span className="text-muted font-normal">(une par ligne)</span>
        </label>
        <textarea id="features" name="features" required rows={4} defaultValue={initialValues.features} className="w-full border border-line rounded-lg px-3 py-2 text-sm" />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="sizes">
          Tailles disponibles <span className="text-muted font-normal">(séparées par des virgules)</span>
        </label>
        <input id="sizes" name="sizes" required defaultValue={initialValues.sizes} className="w-full border border-line rounded-lg px-3 py-2 text-sm" />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="tags">
          Tags <span className="text-muted font-normal">(séparés par des virgules)</span>
        </label>
        <input id="tags" name="tags" defaultValue={initialValues.tags} className="w-full border border-line rounded-lg px-3 py-2 text-sm" />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="collectionId">
          Collection
        </label>
        <select
          id="collectionId"
          name="collectionId"
          required
          defaultValue={initialValues.collectionId}
          className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="" disabled>
            {collections.length === 0 ? "Liste indisponible" : "Choisir une collection…"}
          </option>
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="price">
            Prix de vente (DH)
          </label>
          <input id="price" name="price" type="number" step="0.01" min="0" required defaultValue={initialValues.price} className="w-full border border-line rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="compareAtPrice">
            Prix comparé (DH)
          </label>
          <input id="compareAtPrice" name="compareAtPrice" type="number" step="0.01" min="0" required defaultValue={initialValues.compareAtPrice} className="w-full border border-line rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>

      <SubmitButton />
    </form>
  );
}
