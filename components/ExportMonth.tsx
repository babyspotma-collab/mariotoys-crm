import { DownloadSimple } from "@phosphor-icons/react/dist/ssr";

// Export Excel des commandes confirmées d'un mois : simple formulaire GET vers
// /orders/export (aucun JavaScript nécessaire). Mois proposé : celui en cours.
export default function ExportMonth({ defaultMonth }: { defaultMonth: string }) {
  return (
    <form action="/orders/export" method="get" className="flex items-center gap-2">
      <label className="sr-only" htmlFor="export-month">
        Mois à exporter
      </label>
      <input id="export-month" type="month" name="month" defaultValue={defaultMonth} required className="input w-[170px]" />
      <button type="submit" className="btn-secondary">
        <DownloadSimple size={16} aria-hidden="true" />
        Exporter Excel
      </button>
    </form>
  );
}
