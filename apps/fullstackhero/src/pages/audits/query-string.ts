/**
 * Blazor's `NavigationManager.GetUriWithQueryParameters(uri, parameters)`, which Tsazor's NavigationManager doesn't
 * have yet: `uri` with the given query parameters set (a `null` value removes the key), every other parameter kept.
 * `null` in place of the changes clears the whole query (React Router's `setParams(new URLSearchParams())`).
 */
export function withQuery(uri: string, changes: Record<string, string | null> | null): string {
  const url = new URL(uri);
  if (changes === null) {
    url.search = "";
    return url.toString();
  }
  const params = new URLSearchParams(url.search);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
  url.search = params.toString();
  return url.toString();
}
