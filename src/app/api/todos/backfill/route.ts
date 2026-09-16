import {NextResponse} from 'next/server';

import {sql} from '@/db';
import {embedMany, toVector} from '@/lib/embeddings';

export const runtime = 'nodejs';

type PendingRow = {id: string; title: string};

/**
 * Fills in embeddings for todos that do not have one.
 *
 * Nobody adds vector search to an empty database. 002 added `embedding` to a
 * table that already had rows, and those rows are invisible to search until
 * something fills them in — wiring up writes only covers todos created from
 * now on.
 *
 * The same path is how you re-embed after a model change. An embedding is
 * derived data: it is a function of the title *and* the model, so switching
 * models makes every stored vector stale. That rebuild is this query with
 * `where embedding is null` changed to `where true`.
 *
 * Distant third, it also recovers todos whose `after()` embedding call in
 * POST /api/todos failed or was killed.
 *
 * Does up to 100 at a time, in a single batched API call. Run it again if you
 * had more than that.
 *
 * There is no auth on this, matching the rest of the app. It is a write
 * endpoint that spends OpenAI credits, so it does not belong on a real deploy
 * as-is.
 */
export async function POST() {
  const pending = await sql<PendingRow[]>`
    select id, title from todos
    where embedding is null
    order by created_at
    limit 100
  `;

  if (pending.length === 0) {
    return NextResponse.json({embedded: 0});
  }

  let embeddings: number[][];

  try {
    embeddings = await embedMany(pending.map(todo => todo.title));
  } catch {
    return NextResponse.json({error: 'Failed to embed todos'}, {status: 502});
  }

  for (const [index, todo] of pending.entries()) {
    await sql`
      update todos
      set embedding = ${toVector(embeddings[index])}::vector
      where id = ${todo.id}
    `;
  }

  return NextResponse.json({embedded: pending.length});
}
