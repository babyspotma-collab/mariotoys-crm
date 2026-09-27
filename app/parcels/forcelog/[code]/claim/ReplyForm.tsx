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
      <label htmlFor="reply" className="label mb-0">
        Votre message
      </label>
            <textarea
        id="reply"
        name="message"
        required
        maxLength={1000}
        rows={3}
        className="input"
      />
      {state.error && <p className="alert-error">{state.error}</p>}
      <div>
        <SubmitButton />
      </div>
    </form>
  );
}
