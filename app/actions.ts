"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/auth";

export async function logout() {
  cookies().delete(SESSION_COOKIE);
  redirect("/login");
}
