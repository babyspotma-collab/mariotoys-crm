"use client";

import { usePathname } from "next/navigation";
import { logout } from "@/app/actions";
import MoreMenu from "@/components/MoreMenu";
import { ChartBar, Package, Receipt, ShoppingBag, SignOut, Sparkle } from "@phosphor-icons/react/dist/ssr";

const NAV = [
  { href: "/", label: "Commandes", short: "Commandes", Icon: ShoppingBag },
  { href: "/parcels", label: "Colis", short: "Colis", Icon: Package },
  { href: "/product-jobs", label: "Création produits", short: "Produits", Icon: Sparkle },
  { href: "/billing", label: "Facturation", short: "Factures", Icon: Receipt },
  { href: "/stats", label: "Statistiques", short: "Stats", Icon: ChartBar },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/orders");
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Logo({ size }: { size: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-lg bg-accent font-bold text-white"
      style={{ width: size, height: size, fontSize: size / 2 }}
    >
      M
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  return (
    <>
      {/* Desktop : barre latérale fixe */}
      <nav
        aria-label="Navigation principale"
        className="sticky top-0 hidden h-[100dvh] md:flex md:w-[228px] md:shrink-0 md:flex-col md:gap-8 md:border-r md:border-line md:bg-white md:px-3 md:py-6"
      >
        <div className="flex items-center gap-2.5 px-3">
          <Logo size={28} />
          <div className="text-[15px] font-semibold tracking-tight">Mario Toys</div>
        </div>

        <div className="flex flex-col gap-0.5">
          {NAV.map(({ href, label, Icon }) => {
            const active = isActive(pathname, href);
            return (
              <a
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex h-10 items-center gap-3 rounded-lg px-3 text-sm no-underline transition-colors ${
                  active ? "bg-cream-dark font-semibold text-ink" : "text-body hover:bg-cream hover:text-ink"
                }`}
              >
                <Icon size={19} weight={active ? "fill" : "regular"} aria-hidden="true" />
                {label}
              </a>
            );
          })}
        </div>

        <form action={logout} className="mt-auto">
          <button
            type="submit"
            className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-muted transition-colors hover:bg-cream hover:text-ink"
          >
            <SignOut size={19} aria-hidden="true" />
            Se déconnecter
          </button>
        </form>
      </nav>

      {/* Mobile : barre supérieure (logo + menu compte) */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-white/90 px-4 pt-[env(safe-area-inset-top,0px)] backdrop-blur md:hidden">
        <div className="flex items-center gap-2">
          <Logo size={26} />
          <div className="text-sm font-semibold tracking-tight">Mario Toys</div>
        </div>
        <MoreMenu>
          <form action={logout}>
            <button type="submit" className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-ink hover:bg-cream">
              <SignOut size={16} aria-hidden="true" />
              Se déconnecter
            </button>
          </form>
        </MoreMenu>
      </header>

      {/* Mobile : barre d'onglets fixe en bas */}
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur md:hidden"
      >
        {NAV.map(({ href, short, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <a
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 text-[10.5px] no-underline ${
                active ? "font-semibold text-ink" : "text-muted"
              }`}
            >
              <Icon size={22} weight={active ? "fill" : "regular"} aria-hidden="true" />
              <span className="leading-none">{short}</span>
            </a>
          );
        })}
      </nav>
    </>
  );
}
