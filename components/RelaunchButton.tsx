"use client";

import { useState, useTransition } from "react";

export default function RelaunchButton({
  code,
  action,
}: {
  code: string;
  action: (code: string) => Promise<{ error: string | null; success: boolean }>;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ error: string | null; success: boolean } | null>(null);

  function handleClick(e: React.MouseEvent) {
    // Le bouton vit à l'intérieur de la carte-lien vers la fiche colis —
    // empêcher la navigation du lien parent au clic.
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Relancer le colis ${code} auprès de Forcelog ?`)) return;
    startTransition(async () => {
      const res = await action(code);
      setResult(res);
    });
  }

  if (result?.success) {
    return <p className="text-xs text-sage-dark font-medium">Relance envoyée ✓</p>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="text-xs font-medium px-3 py-1.5 rounded-full bg-ink text-white hover:bg-black transition-colors disabled:opacity-50"
      >
        {pending ? "Envoi…" : "Relancer"}
      </button>
      {result?.error && <p className="text-xs text-danger">{result.error}</p>}
    </div>
  );
}
