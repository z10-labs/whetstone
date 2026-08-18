export function fileName(path: string): string {
  return path.split('/').pop() || path;
}

/** Last two path segments so `route.ts` files stay distinguishable. */
export function displayPath(path: string): string {
  const parts = path.split('/').filter(Boolean);
  if (parts.length <= 2) return path;
  return parts.slice(-2).join('/');
}
