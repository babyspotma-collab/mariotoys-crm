"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Recharge les données serveur de la page à intervalle régulier. Pour ne pas
// réveiller la base inutilement (Neon, plan gratuit) : seulement quand
// `active` est vrai (un job en attente ou en cours) ET que l'onglet est
// visible. Onglet en arrière-plan ou rien à suivre : aucun appel.
export default function AutoRefresh({ seconds, active }: { seconds: number; active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = setInterval(tick, seconds * 1000);
    // Retour sur l'onglet : on rattrape tout de suite ce qui a été manqué.
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, seconds, active]);
  return null;
}
