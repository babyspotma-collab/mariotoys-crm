"use server";

import { redirect } from "next/navigation";
import { checkPassword } from "@/lib/auth";
import { clearLoginFailures, clientIp, loginBlockedMinutes, recordLoginFailure, startSession } from "@/lib/session";

// Connexion : 5 essais ratés par adresse IP sur 15 minutes (et 50 toutes
// adresses confondues), puis attente. Un essai bloqué ne teste même pas le mot de passe.
export async function login(formData: FormData) {
  const ip = clientIp();
  const wait = await loginBlockedMinutes(ip);
  if (wait > 0) redirect(`/login?wait=${wait}`);

  const password = String(formData.get("password") ?? "").slice(0, 200);
  if (!(await checkPassword(password))) {
    await recordLoginFailure(ip);
    redirect("/login?error=1");
  }

  await clearLoginFailures(ip);
  await startSession();
  redirect("/");
}
