"use client";

import { usePathname } from "next/navigation";
import { logout } from "@/app/actions";
import MoreMenu from "@/components/MoreMenu";

const NAV = [
  {
    href: "/",
    label: "Commandes",
    short: "Commandes",
    icon: <path d="M5 8h14l-1 12H6L5 8z M9 8V6a3 3 0 0 1 6 0v2" />,
  },
  {
    href: "/parcels",
    label: "Colis",
    short: "Colis",
    icon: <path d="M3 7l9-4 9 4-9 4-9-4z M3 7v10l9 4 9-4V7 M12 11v10" />,
  },
  {
    href: "/product-jobs",
    label: "Création produits",
    short: "Produits",
    icon: <path d="M4 4h16v16H4z M12 8v8M8 12h8" />,
  },
  {
    href: "/billing",
    label: "Facturation",
    short: "Factures",
    icon: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z M9 8h6M9 12h6" />,
  },
  {
    href: "/stats",
    label: "Statistiques",
    short: "Stats",
    icon: <path d="M5 20V10M12 20V4M19 20v-7" />,
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  return (
    <>
      {/* Desktop: sidebar fixe à gauche */}
      <nav
        aria-label="Navigation principale"
        className="hidden md:flex md:w-[232px] md:shrink-0 md:flex-col md:gap-8 md:border-r md:border-line md:bg-cream-dark md:px-4 md:py-7"
      >
        <div className="flex items-center gap-2.5 px-2">
          <div className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-accent text-[15px] font-bold text-white">
            M
          </div>
          <div className="text-[15px] font-semibold">Mario Toys</div>
        </div>

        <div className="flex flex-col gap-0.5">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <a
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-10 items-center gap-3 rounded-lg px-3 text-sm no-underline transition-colors ${
                  active
                    ? "bg-white font-semibold text-ink shadow-sm"
                    : "text-body hover:text-ink"
                }`}
              >
                <NavIcon>{item.icon}</NavIcon>
                {item.label}
              </a>
            );
          })}
        </div>

        <form action={logout} className="mt-auto">
          <button type="submit" className="px-3 text-[13px] text-muted hover:text-ink">
            Se déconnecter
          </button>
        </form>
      </nav>

      {/* Mobile: barre supérieure (logo + menu compte) */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-cream px-4 pt-[env(safe-area-inset-top,0px)] md:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-[13px] font-bold text-white">
            M
          </div>
          <div className="text-sm font-semibold">Mario Toys</div>
        </div>
        <MoreMenu>
          <form action={logout}>
            <button type="submit" className="w-full rounded-md px-2.5 py-1.5 text-left text-[13px] text-ink hover:bg-cream-dark">
              Se déconnecter
            </button>
          </form>
        </MoreMenu>
      </header>

      {/* Mobile: barre fixe en bas, 5 onglets + libellé court */}
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-cream-dark/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur md:hidden"
      >
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <a
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 border-t-2 py-1.5 text-[10px] no-underline"
              style={{ borderTopColor: active ? "#C8381F" : "transparent" }}
            >
              <span className={active ? "text-accent" : "text-muted"}>
                <NavIcon>{item.icon}</NavIcon>
              </span>
              <span className={`leading-none ${active ? "font-semibold text-ink" : "text-muted"}`}>{item.short}</span>
            </a>
          );
        })}
      </nav>
    </>
  );
}
