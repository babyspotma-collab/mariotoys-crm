"use client";

import { useFormState, useFormStatus } from "react-dom";
import { submitReply, type ClaimState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Envoi…" : "Répondre"}
    </button>
  );
}

export default function ReplyForm({ code }: { code: string }) {
  const action = submitReply.bind(null, code);
  const initialState: ClaimState = { error: null };
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.error && <p className="text-sm text-danger bg-danger/10 rounded-lg p-3">{state.error}</p>}
      <textarea
        name="message"
        required
        maxLength={1000}
        rows={3}
        placeholder="Votre message…"
        className="w-full border border-line rounded-lg px-3 py-2 text-sm"
      />
      <div>
        <SubmitButton />
      </div>
    </form>
  );
}
