export function slugify(input: string): string {
  const folded = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const words = folded.split("-").filter((part) => part.length > 0).slice(0, 6);
  return words.length === 0 ? "untitled" : words.join("-");
}
