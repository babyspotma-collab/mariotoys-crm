import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";

// Champ de recherche (GET) qui conserve les autres filtres de la page via
// des champs cachés.
export default function SearchForm({
  action,
  hidden,
  defaultValue,
  placeholder,
  label,
}: {
  action: string;
  hidden: Record<string, string>;
  defaultValue?: string;
  placeholder: string;
  label: string;
}) {
  return (
    <form action={action} role="search" className="relative w-full md:w-[280px]">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <MagnifyingGlass
        size={18}
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
      />
      <input
        name="q"
        type="search"
        aria-label={label}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="input pl-10"
      />
    </form>
  );
}
