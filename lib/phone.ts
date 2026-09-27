// Normalise un numéro marocain vers le format local attendu par Forcelog :
// chiffres uniquement, 10 chiffres commençant par 0 (ex: 0612345678).
// Gère les indicatifs internationaux (+212... / 00212...), y compris quand
// Shopify garde le 0 local après l'indicatif (+212 0612345678, soit 13
// chiffres "2120…"), ainsi qu'un numéro à 9 chiffres sans le 0 initial.
export function normalizeMoroccanPhone(raw: string): string {
  if (!raw) return raw;

  let digits = raw.replace(/\D/g, ""); // ne garder que les chiffres (retire +, espaces, tirets...)

  if (digits.startsWith("00212")) digits = digits.slice(5);
  else if (digits.startsWith("212") && digits.length >= 12) digits = digits.slice(3);

  if (digits.length === 9 && !digits.startsWith("0")) digits = "0" + digits;

  return digits;
}
