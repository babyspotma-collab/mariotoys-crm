// Normalise un numéro marocain vers le format local attendu par Forcelog :
// chiffres uniquement, 10 chiffres commençant par 0 (ex: 0612345678).
// Gère les indicatifs internationaux (+212.../00212...) que Shopify
// renvoie parfois, ainsi qu'un numéro à 9 chiffres sans le 0 initial.
export function normalizeMoroccanPhone(raw: string): string {
  if (!raw) return raw;

  let digits = raw.replace(/\D/g, ""); // ne garder que les chiffres (retire +, espaces, tirets...)

  if (digits.startsWith("212") && digits.length === 12) {
    digits = "0" + digits.slice(3);
  } else if (digits.startsWith("00212") && digits.length === 14) {
    digits = "0" + digits.slice(5);
  } else if (!digits.startsWith("0") && digits.length === 9) {
    digits = "0" + digits;
  }

  return digits;
}
