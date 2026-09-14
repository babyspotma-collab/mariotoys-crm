"use client";

import { useFormState, useFormStatus } from "react-dom";
import { generateDraft, type GenerateState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Génération en cours… (peut prendre 10-20s)" : "Générer la fiche"}
    </button>
  );
}

export default function GenerateForm() {
  const initialState: GenerateState = { error: null };
  const [state, formAction] = useFormState(generateDraft, initialState);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-5 bg-white border border-line rounded-2xl p-6"
    >
      {state.error && <p className="text-sm text-danger bg-danger/10 rounded-lg p-3">{state.error}</p>}

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="photos">
          Photos du produit
        </label>
        <input
          id="photos"
          name="photos"
          type="file"
          accept="image/*"
          multiple
          required
          className="w-full text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="cost">
          Coût d&apos;achat (DH)
        </label>
        <input
          id="cost"
          name="cost"
          type="number"
          min={0}
          step="0.01"
          required
          className="w-full border border-line rounded-lg px-3 py-2 text-sm"
        />
        <p className="text-xs text-muted mt-1">
          Sert à calculer le prix de vente (arrondi au 50 supérieur, -1 DH).
        </p>
      </div>

      <SubmitButton />
    </form>
  );
}
