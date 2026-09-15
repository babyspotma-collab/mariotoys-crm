export default function MonthFilter({ month, action }: { month: string; action: string }) {
  return (
    <form className="flex items-center gap-2" action={action}>
      <input
        type="month"
        name="month"
        defaultValue={month}
        className="border border-line rounded-lg px-3 py-1.5 text-sm bg-white"
      />
      <button type="submit" className="text-sm text-muted hover:text-ink px-2">
        Filtrer
      </button>
    </form>
  );
}
