"use server";

import { revalidatePath } from "next/cache";
import { relaunchParcel } from "@/lib/forcelog";

export type RelaunchState = { error: string | null; success: boolean };

export async function relaunch(code: string): Promise<RelaunchState> {
  try {
    await relaunchParcel(code);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err), success: false };
  }
  revalidatePath("/parcels/stuck");
  return { error: null, success: true };
}
