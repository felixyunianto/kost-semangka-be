export function normalizeNameQuery(name?: string) {
  if (!name) {
    return "";
  }

  return name
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
