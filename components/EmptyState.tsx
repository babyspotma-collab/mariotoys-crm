export default function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-1.5 border-dashed border-line-dashed px-6 py-12 text-center">
      <p className="text-[15px] font-semibold">{title}</p>
      {children && <div className="max-w-[46ch] text-sm leading-relaxed text-muted">{children}</div>}
    </div>
  );
}
