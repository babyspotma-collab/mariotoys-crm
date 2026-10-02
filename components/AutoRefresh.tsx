"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Recharge les données serveur de la page à intervalle régulier (état du
// worker, avancement des jobs), sans recharger la page entière.
export default function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
