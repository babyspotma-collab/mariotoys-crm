import { headers } from "next/headers";
import PageHeader from "@/components/PageHeader";
import { DEFAULT_CITY_KEY } from "@/lib/profit/city-rate";
import { loadRates } from "@/lib/profit/report";
import { getSettings, getSyncStatus } from "@/lib/profit/settings";
import { saveCasa, saveGeneral, saveMetaAccounts, saveRates, saveReturnFees } from "../actions";
import { EditableRows, SettingsForm } from "../_components/SettingsForm";
import { ProfitNav, SyncLine } from "../_components/ui";

export const dynamic = "force-dynamic";

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));

// Réglages de la page Rentabilité : taux USD→MAD, retours abîmés, comptes Meta,
// livreurs Casa, frais de retour et tarifs par ville de chaque transporteur.
export default async function ReglagesPage() {
  const [settings, rates, status] = await Promise.all([getSettings(), loadRates(), getSyncStatus()]);
  const host = headers().get("host") ?? "mariotoys-crm-app.vercel.app";
  const rateRows = (c: "FORCELOG" | "OZON") =>
    rates[c].filter((r) => r.cityKey !== DEFAULT_CITY_KEY).sort((a, b) => a.fee - b.fee || a.city.localeCompare(b.city)).map((r) => ({ city: r.city, fee: fmt(r.fee) }));
  const defaultFee = (c: "FORCELOG" | "OZON") => fmt(rates[c].find((r) => r.cityKey === DEFAULT_CITY_KEY)?.fee);

  return (
    <>
      <PageHeader title="Rentabilité" subtitle="Réglages" />
      <ProfitNav active="/rentabilite/reglages" />

      <Section title="Général">
        <SettingsForm action={saveGeneral}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm">
              <span className="label">Taux USD → MAD</span>
              <input name="usdToMad" defaultValue={fmt(settings.usdToMad)} inputMode="decimal" required className="input" />
              <span className="hint block">Appliqué aux dépenses Meta (comptes en USD). Incluez les frais bancaires si besoin.</span>
            </label>
            <label className="text-sm">
              <span className="label">% de retours abîmés</span>
              <input name="damagedReturnPct" defaultValue={fmt(settings.damagedReturnPct)} inputMode="decimal" required className="input" />
              <span className="hint block">Part du coût d&apos;achat des produits retournés comptée comme perte (0 = tout revient en stock).</span>
            </label>
          </div>
        </SettingsForm>
      </Section>

      <Section title="Comptes publicitaires Meta">
        <SettingsForm action={saveMetaAccounts}>
          <EditableRows
            addLabel="Ajouter un compte"
            columns={[
              { key: "id", label: "Identifiant du compte", placeholder: "774579314518013" },
              { key: "name", label: "Nom", placeholder: "ADS 5" },
            ]}
            initial={settings.metaAccounts.map((a) => ({ id: a.id, name: a.name }))}
          />
          <p className="hint">
            Jeton Meta (META_ACCESS_TOKEN) : {process.env.META_ACCESS_TOKEN ? "configuré" : "non configuré sur Vercel"}. Dépenses récupérées chaque nuit (7 derniers jours).
          </p>
        </SettingsForm>
      </Section>

      <Section title="Livraison Casa (vos livreurs)">
        <SettingsForm action={saveCasa}>
          <label className="text-sm md:max-w-xs">
            <span className="label">Tarif des autres livreurs (DH par livraison)</span>
            <input name="defaultFee" defaultValue={fmt(settings.casa.defaultFee)} inputMode="decimal" required className="input" />
          </label>
          <EditableRows
            addLabel="Ajouter un livreur"
            columns={[
              { key: "name", label: "Livreur", placeholder: "Nizar" },
              { key: "fee", label: "DH par livraison", type: "number", placeholder: "20", className: "w-40" },
            ]}
            initial={settings.casa.couriers.map((c) => ({ name: c.name, fee: fmt(c.fee) }))}
          />
          <p className="hint">Nom comparé sans tenir compte des majuscules ni des accents. Une commande retournée paie aussi la course.</p>
        </SettingsForm>
      </Section>

      <Section title="Frais de retour (en plus du tarif aller)">
        <SettingsForm action={saveReturnFees}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm">
              <span className="label">Forcelog (DH)</span>
              <input name="FORCELOG" defaultValue={fmt(settings.returnFees.FORCELOG)} inputMode="decimal" className="input" />
            </label>
            <label className="text-sm">
              <span className="label">Ozon Express (DH)</span>
              <input name="OZON" defaultValue={fmt(settings.returnFees.OZON)} inputMode="decimal" placeholder="à remplir" className="input" />
            </label>
          </div>
          <p className="hint">Un colis refusé ou retourné paie toujours le tarif aller de sa ville ; ces frais s&apos;ajoutent.</p>
        </SettingsForm>
      </Section>

      {(["FORCELOG", "OZON"] as const).map((carrier) => (
        <Section key={carrier} title={`Tarifs ${carrier === "FORCELOG" ? "Forcelog" : "Ozon Express"} par ville`}>
          <SettingsForm action={saveRates.bind(null, carrier)}>
            <label className="text-sm md:max-w-xs">
              <span className="label">Tarif par défaut (villes non listées, DH)</span>
              <input name="defaultFee" defaultValue={defaultFee(carrier)} inputMode="decimal" placeholder="à remplir" className="input" />
            </label>
            <EditableRows
              searchable
              addLabel="Ajouter une ville"
              columns={[
                { key: "city", label: "Ville", placeholder: "Nom de la ville" },
                { key: "fee", label: "Tarif (DH)", type: "number", placeholder: "35", className: "w-32" },
              ]}
              initial={rateRows(carrier)}
            />
            <p className="hint">
              Noms comparés sans accents, majuscules ni lettres doublées (« Tit melil » = « Tit Mellil ») ; « Casablanca - Californie » prend le tarif de Casablanca.
              Une ville inconnue prend le tarif par défaut.
            </p>
          </SettingsForm>
        </Section>
      ))}

      <Section title="Synchronisation ALBASEET+">
        <div className="flex flex-col gap-2 text-sm">
          <p>
            Adresse de l&apos;endpoint : <code className="rounded bg-cream-dark px-1.5 py-0.5 text-[13px]">https://{host}/api/stock-sync</code>
          </p>
          <p className="text-muted">
            Secret STOCK_SYNC_SECRET : {process.env.STOCK_SYNC_SECRET ? "configuré" : "non configuré sur Vercel (l'endpoint refuse tout envoi)"}.
          </p>
          <SyncLine status={status} />
        </div>
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card flex flex-col gap-4 p-4 md:p-6">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}
