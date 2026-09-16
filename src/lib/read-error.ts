/**
 * Shared by both client components. Every error response in this app is
 * `{"error": "..."}`, so reading one is the same three lines everywhere.
 */
export async function readError(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  return body?.error ?? 'Something went wrong';
}
