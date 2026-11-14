"use server";

import { redirect } from "next/navigation";
import { endAllSessions, endSession, requireSession } from "@/lib/session";

/** Déconnexion de cet appareil : la session est révoquée en base. */
export async function logout() {
  await endSession();
  redirect("/login");
}

/** Déconnexion de tous les appareils (téléphone perdu, accès partagé à couper). */
export async function logoutEverywhere() {
  await requireSession();
  await endAllSessions();
  redirect("/login?all=1");
}
