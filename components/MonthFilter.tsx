"use client";

export default function MonthFilter({ month, action }: { month: string; action: string }) {
  return (
    <form className="flex items-center gap-2" action={action}>
      <input
        type="month"
        name="month"
        defaultValue={month}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        aria-label="Mois"
        className="input w-auto font-medium"
      />
      <noscript>
        <button type="submit" className="text-[13px] text-muted hover:text-ink">
          Filtrer
        </button>
      </noscript>
    </form>
  );
}
