// Vérification rapide de periodRange : npx tsx lib/date-range.check.ts
import assert from "node:assert";
import { periodRange, periodParams } from "./date-range";
const now = new Date("2026-09-27T23:30:00Z");
const today = periodRange({ period: "today" }, now);
assert.equal(today.from, "2026-09-27");
assert.equal(today.end.getTime() - today.start.getTime(), 86_400_000);
const w = periodRange({ period: "7d" }, now);
assert.equal(w.from, "2026-09-21"); assert.equal(w.to, "2026-09-27");
const m = periodRange({}, now);
assert.equal(m.period, "month"); assert.equal(m.from, "2026-09-01"); assert.equal(m.to, "2026-09-30");
assert.deepEqual(periodParams(m), {});
const c = periodRange({ period: "custom", from: "2026-09-15", to: "2026-09-01" }, now);
assert.equal(c.from, "2026-09-01"); assert.equal(c.to, "2026-09-15"); assert.equal(c.label, "Du 01/09/2026 au 15/09/2026");
const bad = periodRange({ period: "custom", from: "2026-02-31" }, now);
assert.equal(bad.from, "2026-09-01");
const jan = periodRange({ period: "today" }, new Date("2026-01-15T12:00:00Z"));
assert.equal(jan.start.toISOString(), "2026-01-14T23:00:00.000Z"); // UTC+1 en janvier
console.log("period checks OK", today.start.toISOString(), m.label);
