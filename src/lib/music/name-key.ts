/**
 * Names compared without case, accents or punctuation, so that a roster
 * name and a streaming service's display name meet: "JAŸ-Z" and "Jay-Z",
 * "GIVĒON" and "Giveon", "Krept & Konan" and "Krept and Konan".
 */
export function nameKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}
