// Squelette affiché pendant le chargement serveur de n'importe quelle page
// (appels Forcelog / Ozon / Shopify parfois lents).
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Chargement" className="flex animate-pulse flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="h-7 w-44 rounded-lg bg-cream-dark" />
        <div className="h-4 w-64 rounded-md bg-cream-dark" />
      </div>
      <div className="h-10 w-full rounded-[10px] bg-cream-dark md:w-80" />
      <div className="card flex flex-col divide-y divide-line-soft">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-4 w-1/3 rounded-md bg-cream-dark" />
              <div className="h-3 w-1/2 rounded-md bg-cream" />
            </div>
            <div className="h-4 w-16 rounded-md bg-cream-dark" />
          </div>
        ))}
      </div>
    </div>
  );
}
