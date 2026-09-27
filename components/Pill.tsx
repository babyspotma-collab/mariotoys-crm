export type PillTone = "green" | "amber" | "red" | "blue" | "gray";

const TONE_CLASSES: Record<PillTone, string> = {
  green: "bg-pill-green-bg text-pill-green-fg",
  amber: "bg-pill-amber-bg text-pill-amber-fg",
  red: "bg-pill-red-bg text-pill-red-fg",
  blue: "bg-pill-blue-bg text-pill-blue-fg",
  gray: "bg-pill-gray-bg text-pill-gray-fg",
};

export default function Pill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-block h-6 max-w-full truncate rounded-md px-2 align-middle text-xs font-medium leading-6 ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
