import { redirect } from "next/navigation";

// Les statistiques sont sur l'Accueil. Les anciens liens (/stats?month=2026-10)
// y mènent, sur le même mois.
export default function StatsPage({ searchParams }: { searchParams: { month?: string } }) {
  const month = searchParams.month?.match(/^\d{4}-(0[1-9]|1[0-2])$/) ? searchParams.month : null;
  redirect(month ? `/?month=${month}` : "/");
}
