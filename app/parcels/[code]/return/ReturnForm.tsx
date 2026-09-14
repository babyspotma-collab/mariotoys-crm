"use client";

import { useFormState, useFormStatus } from "react-dom";
import { submitReturn, type ReturnState } from "./actions";
import type { ForcelogCity } from "@/lib/forcelog";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Envoi…" : "Envoyer la demande de retour"}
    </button>
  );
}

export default function ReturnForm({ code, cities }: { code: string; cities: ForcelogCity[] }) {
  const action = submitReturn.bind(null, code);
  const initialState: ReturnState = { error: null };
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5 bg-white border border-line rounded-2xl p-6">
      {state.error && <p className="text-sm text-danger bg-danger/10 rounded-lg p-3">{state.error}</p>}

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="phone">
          Téléphone
        </label>
        <input id="phone" name="phone" required className="w-full border border-line rounded-lg px-3 py-2 text-sm" />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="quarter">
          Quartier <span className="text-muted font-normal">(5 caractères minimum)</span>
        </label>
        <input
          id="quarter"
          name="quarter"
          required
          minLength={5}
          className="w-full border border-line rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="city">
          Ville
        </label>
        <select id="city" name="city" required className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white">
          <option value="" disabled selected>
            {cities.length === 0 ? "Liste indisponible" : "Sélectionner une ville…"}
          </option>
          {cities.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="note">
          Commentaire <span className="text-muted font-normal">(optionnel)</span>
        </label>
        <textarea id="note" name="note" rows={2} className="w-full border border-line rounded-lg px-3 py-2 text-sm" />
      </div>

      <SubmitButton />
    </form>
  );
}
