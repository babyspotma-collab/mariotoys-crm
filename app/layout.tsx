import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mario Toys CRM",
  description: "Gestion des commandes Mario Toys et expédition Forcelog / Ozon Express",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="bg-cream text-ink font-sans antialiased">
        <div className="flex min-h-screen flex-col md:flex-row">
          <Sidebar />
          <main className="min-w-0 flex-grow px-5 py-8 pb-24 md:px-12 md:py-10 md:pb-10">
            <div className="mx-auto flex max-w-6xl flex-col gap-7">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
