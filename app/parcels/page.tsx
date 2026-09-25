import AppHeader from "@/components/AppHeader";

export default function ParcelsCarrierPickerPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <AppHeader active="parcels" />
      <p className="text-sm text-muted mb-6">Choisissez un transporteur pour voir ses colis.</p>

      <div className="grid grid-cols-2 gap-4">
        <a
          href="/parcels/forcelog"
          className="block bg-white border border-line rounded-2xl p-6 hover:border-sage-dark transition-colors"
        >
          <p className="text-lg font-semibold mb-1">Forcelog</p>
          <p className="text-sm text-muted">Suivi des colis Forcelog, par statut.</p>
        </a>
        <a
          href="/parcels/ozon"
          className="block bg-white border border-line rounded-2xl p-6 hover:border-sage-dark transition-colors"
        >
          <p className="text-lg font-semibold mb-1">Ozon Express</p>
          <p className="text-sm text-muted">Suivi des colis Ozon Express, par statut.</p>
        </a>
      </div>
    </main>
  );
}
