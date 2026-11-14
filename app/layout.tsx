import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { AUTH_HEADER } from "@/lib/auth";
import { hasSession } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mario Toys CRM",
  description: "Gestion des commandes Mario Toys et expédition Forcelog / Ozon Express",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Page protégée (en-tête posé par le middleware) : la session doit aussi
  // exister en base, ni révoquée ni expirée.
  if (headers().get(AUTH_HEADER) === "1" && !(await hasSession())) redirect("/login");

  return (
    <html lang="fr" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="overflow-x-hidden bg-cream text-ink font-sans antialiased">
        <div className="flex min-h-[100dvh] flex-col md:flex-row">
          <Sidebar />
          <main className="min-w-0 flex-grow px-4 pb-28 pt-5 md:px-10 md:py-9">
            <div className="mx-auto flex max-w-6xl flex-col gap-5 md:gap-6">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
