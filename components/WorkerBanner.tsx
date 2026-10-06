"use client";

import { useEffect, useState } from "react";
import type { WorkerStatus } from "@/lib/creatives";

const ISSUE_TEXT: Record<NonNullable<WorkerStatus["issue"]>, { title: string; hint: string }> = {
  SESSION_EXPIRED: {
    title: "Session Gemini expirée",
    hint: "Reconnectez le compte Google secondaire dans le Chrome du programme local. La génération reprendra toute seule.",
  },
  QUOTA: {
    title: "Limite quotidienne Gemini atteinte",
    hint: "Le programme est en pause et reprendra automatiquement quand Gemini l'autorisera.",
  },
  CAPTCHA: {
    title: "Gemini demande une vérification (captcha)",
    hint: "À résoudre à la main dans le Chrome du programme local. La génération reprendra ensuite.",
  },
};

// Bandeau d'état du programme local. Pour ne pas réveiller la base
// inutilement (Neon) : rafraîchi toutes les 60 s, seulement si l'onglet est
// visible, et tout de suite au retour sur l'onglet.
export default function WorkerBanner({ initial }: { initial: WorkerStatus }) {
  const [status, setStatus] = useState(initial);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/creatives/worker-status", { cache: "no-store" });
        if (res.ok && !cancelled) setStatus(await res.json());
      } catch {
        // Réseau coupé : on garde le dernier état connu.
      }
    };
    const id = setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  if (status.online && status.issue) {
    const t = ISSUE_TEXT[status.issue];
    return (
      <div role="status" className="rounded-[10px] bg-pill-red-bg px-3.5 py-3 text-sm text-pill-red-fg">
        <p className="font-semibold">{t.title}</p>
        <p className="mt-0.5">{t.hint}</p>
      </div>
    );
  }

  if (status.online) {
    return (
      <div role="status" className="flex items-center gap-2 text-[13px] text-muted">
        <span className="h-2 w-2 shrink-0 rounded-full bg-pill-green-fg" aria-hidden="true" />
        <span className="font-medium text-ink">Programme local en ligne</span>
        {status.activity && <span className="truncate">· {status.activity}</span>}
      </div>
    );
  }

  return (
    <div role="status" className="flex items-start gap-2 text-[13px] text-muted">
      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-pill-amber-fg" aria-hidden="true" />
      <span>
        <span className="font-medium text-ink">Programme local hors ligne</span> — les générations démarreront dès
        qu&apos;il sera lancé sur le PC.
      </span>
    </div>
  );
}
