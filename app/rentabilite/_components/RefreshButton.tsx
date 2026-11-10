"use client";

import { useFormState, useFormStatus } from "react-dom";
import { ArrowsClockwise } from "@phosphor-icons/react/dist/ssr";
import { refreshNow, type ActionResult } from "../actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-secondary">
      <ArrowsClockwise size={16} className={pending ? "animate-spin" : ""} aria-hidden="true" />
      {pending ? "Actualisation…" : "Actualiser"}
    </button>
  );
}

// Relance tout de suite la copie du catalogue Shopify et les dépenses Meta
// (normalement faites chaque nuit).
export default function RefreshButton() {
  const [state, action] = useFormState<ActionResult>(refreshNow, null);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <Submit />
      {state && <p className={`max-w-[260px] text-right text-xs ${state.ok ? "text-muted" : "text-accent"}`}>{state.message}</p>}
    </form>
  );
}
