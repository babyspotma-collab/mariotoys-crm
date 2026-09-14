"use client";

import { useFormState, useFormStatus } from "react-dom";
import { createParcel, type ConfirmState } from "./actions";
import type { ForcelogCity } from "@/lib/forcelog";

type InitialValues = {
  receiver: string;
  phone: string;
  city: string;
  quartier: string;
  address: string;
  comment: string;
  productNature: string;
  price: number;
  fragile: boolean;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Création du colis…" : "Créer le colis"}
    </button>
  );
}

export default function ConfirmForm({
  orderId,
  cities,
  initialValues,
}: {
  orderId: string;
  cities: ForcelogCity[];
  initialValues: InitialValues;
}) {
  const action = createParcel.bind(null, orderId);
  const initialState: ConfirmState = { error: null };
  const [state, formAction] = useFormState(action, initialState);

  // Présélectionne la ville Forcelog si son nom correspond à la ville
  // Shopify d'origine ; sinon on laisse le choix explicite à l'utilisateur
  // plutôt que de deviner (c'est tout le but de cet écran).
  const matchedCity = cities.find(
    (c) => c.name.toLowerCase() === initialValues.city.toLowerCase()
  );

  return (
    <form action={formAction} className="flex flex-col gap-5 bg-white border border-line rounded-2xl p-6">
      {state.error && (
        <p className="text-sm text-danger bg-danger/10 rounded-lg p-3">{state.error}</p>
      )}

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="receiver">
          Destinataire
        </label>
        <input
          id="receiver"
          name="receiver"
          required
          defaultValue={initialValues.receiver}
          className="w-full border border-line rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="phone">
          Numéro de téléphone
        </label>
        <input
          id="phone"
          name="phone"
          required
          defaultValue={initialValues.phone}
          className="w-full border border-line rounded-lg px-3 py-2 text-sm"
        />
        <p className="text-xs text-muted mt-1">
          Vérifiez le format (Shopify renvoie parfois un indicatif international, ex. +212, à
          retirer si besoin).
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="city">
          Ville (Forcelog)
        </label>
        <select
          id="city"
          name="city"
          required
          defaultValue={matchedCity?.code ?? ""}
          className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="" disabled>
            {cities.length === 0 ? "Liste des villes indisponible" : "Sélectionner une ville…"}
          </option>
          {cities.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
        {!matchedCity && initialValues.city && (
          <p className="text-xs text-danger mt-1">
            Ville Shopify d&apos;origine « {initialValues.city} » non reconnue automatiquement —
            choisissez la bonne ville dans la liste.
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="quartier">
          Quartier <span className="text-muted font-normal">(optionnel)</span>
        </label>
        <input
          id="quartier"
          name="quartier"
          defaultValue={initialValues.quartier}
          className="w-full border border-line rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="address">
          Adresse
        </label>
        <textarea
          id="address"
          name="address"
          required
          rows={2}
          defaultValue={initialValues.address}
          className="w-full border border-line rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="comment">
          Commentaire <span className="text-muted font-normal">(optionnel)</span>
        </label>
        <textarea
          id="comment"
          name="comment"
          rows={2}
          defaultValue={initialValues.comment}
          className="w-full border border-line rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="productNature">
          Nature de produit
        </label>
        <input
          id="productNature"
          name="productNature"
          required
          defaultValue={initialValues.productNature}
          className="w-full border border-line rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="price">
          Prix (DH)
        </label>
        <input
          id="price"
          name="price"
          type="number"
          step="0.01"
          min="0"
          required
          defaultValue={initialValues.price}
          className="w-full border border-line rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="fragile" defaultChecked={initialValues.fragile} />
        Colis fragile
      </label>

      <div className="flex gap-2 pt-2">
        <SubmitButton />
        <a href="/" className="btn-danger">
          Annuler
        </a>
      </div>
    </form>
  );
}
