/** Logical built-in references stay unchanged in v1 documents; only requests use the host base. */
export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}
