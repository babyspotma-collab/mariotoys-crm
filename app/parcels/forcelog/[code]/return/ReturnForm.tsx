"use client";

import { useFormState, useFormStatus } from "react-dom";
import { submitReturn, type ReturnState } from "./actions";
import type { ForcelogCity } from "@/lib/forcelog";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full md:w-fit" disabled={pending}>
      {pending ? "Envoi…" : "Envoyer la demande de retour"}
    </button>
  );
}

export default function ReturnForm({ code, cities }: { code: string; cities: ForcelogCity[] }) {
  const action = submitReturn.bind(null, code);
  const initialState: ReturnState = { error: null };
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form action={formAction} className="card flex flex-col gap-5 p-4 md:p-6">
      <div>
        <label className="label" htmlFor="phone">
          Téléphone
        </label>
        <input id="phone" name="phone" type="tel" required className="input" />
      </div>

      <div>
        <label className="label" htmlFor="quarter">
          Quartier <span className="font-normal text-muted">(5 caractères minimum)</span>
        </label>
        <input
          id="quarter"
          name="quarter"
          required
          minLength={5}
          className="input"
        />
      </div>

      <div>
        <label className="label" htmlFor="city">
          Ville
        </label>
        <select id="city" name="city" required className="input">
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
        <label className="label" htmlFor="note">
          Commentaire <span className="font-normal text-muted">(optionnel)</span>
        </label>
        <textarea id="note" name="note" rows={2} className="input" />
      </div>

      {state.error && <p className="alert-error">{state.error}</p>}

      <SubmitButton />
    </form>
  );
}
