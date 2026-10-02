// Noms de fichiers envoyés depuis le navigateur : le multipart peut être
// relu en Latin-1 alors qu'il est en UTF-8, ce qui donne "Capture d'Ã©cran"
// au lieu de "Capture d'écran". On retente le décodage en UTF-8, et on ne
// garde le résultat que s'il est propre (aucun caractère de remplacement).
export function fixUtf8Filename(name: string): string {
  if (!/[ÃÂâ][\u0080-ÿ]/.test(name)) return name;
  const decoded = Buffer.from(name, "latin1").toString("utf8");
  return decoded.includes("�") ? name : decoded;
}
