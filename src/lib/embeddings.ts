const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error('OPENAI_API_KEY is not set. Copy .env.example to .env.');
}

/**
 * The whole "AI" dependency: one HTTP POST. No SDK.
 *
 * The official `openai` package would give you retries and a default timeout,
 * but it would also hide how small this surface actually is — and this repo
 * queries Postgres with plain SQL for the same reason.
 */
const ENDPOINT = 'https://api.openai.com/v1/embeddings';

export const EMBEDDING_MODEL = 'text-embedding-3-small';

/**
 * Must match `vector(1536)` in migrations/002_embeddings.sql. Postgres will
 * reject a vector of any other length, which is the one place this mismatch
 * would surface — at write time, loudly.
 */
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * A hung provider must not pin an `after()` callback open forever.
 */
const TIMEOUT_MS = 10_000;

type EmbeddingsResponse = {
  data: {index: number; embedding: number[]}[];
};

/**
 * One text, one vector. This is the whole AI surface for creating a todo and
 * for running a search — a POST with a string, and 1536 numbers back.
 *
 * Written out in full rather than as a one-item call to `embedMany` below.
 * They are two different jobs: this one sits on the hot path of a single user
 * action, the other exists to chew through a table. Sharing an implementation
 * would save a dozen lines and cost you the ability to read either one on its
 * own.
 */
export async function embed(text: string): Promise<number[]> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({model: EMBEDDING_MODEL, input: text}),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`OpenAI embeddings failed: ${response.status} ${await response.text()}`);
  }

  const payload = (await response.json()) as EmbeddingsResponse;
  const [item] = payload.data;

  if (!item) {
    throw new Error('OpenAI returned no embedding');
  }

  return item.embedding;
}

/**
 * One request, many inputs. The API accepts an array, so the backfill embeds a
 * whole batch in a single round trip rather than N of them.
 *
 * The only real difference from `embed` is the last step: with many inputs you
 * have to put the results back in order yourself.
 */
export async function embedMany(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({model: EMBEDDING_MODEL, input: texts}),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`OpenAI embeddings failed: ${response.status} ${await response.text()}`);
  }

  const payload = (await response.json()) as EmbeddingsResponse;

  // Each item carries the index of the input it came from. Sorting by it means
  // we never rely on the response happening to preserve request order.
  return payload.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map(item => item.embedding);
}

/**
 * postgres.js has no idea what a vector is. pgvector's wire format is a string
 * that happens to look exactly like a JSON array, so this plus an explicit
 * `::vector` cast at the call site is the whole bridge.
 */
export function toVector(embedding: number[]): string {
  return JSON.stringify(embedding);
}
