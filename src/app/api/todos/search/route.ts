import {NextResponse} from 'next/server';

import {sql} from '@/db';
import type {SearchResultRow} from '@/db/types';
import {invalidRequest, searchQuerySchema} from '@/lib/api-contract';
import {embed, toVector} from '@/lib/embeddings';

export const runtime = 'nodejs';

/**
 * Nearest-neighbour search has no notion of "no results" — ask it for the top
 * 20 and it will hand you 20 rows however unrelated they are. Without a cutoff,
 * searching for "asdfgh" returns your entire todo list, confidently ranked.
 *
 * This is cosine *distance*, so lower is closer: 0.6 distance is 0.4
 * similarity. The number is a judgement call and depends on your data — short
 * todo titles cluster differently than paragraphs of prose. The API returns the
 * similarity of every result precisely so you can watch where the good ones
 * stop and retune this.
 */
const MAX_DISTANCE = 0.6;

const MAX_RESULTS = 20;

export async function GET(request: Request) {
  const {searchParams} = new URL(request.url);

  // An empty query is a 400, not "return everything". GET /api/todos already
  // does "return everything"; these are deliberately different endpoints.
  const parsed = searchQuerySchema.safeParse({
    q: searchParams.get('q') ?? '',
  });

  if (!parsed.success) {
    return invalidRequest(parsed.error);
  }

  let queryVector: string;

  try {
    queryVector = toVector(await embed(parsed.data.q));
  } catch {
    // Unlike creating a todo, there is no useful degraded answer here: without
    // a vector for the query there is nothing to compare against.
    return NextResponse.json({error: 'Failed to embed search query'}, {status: 502});
  }

  try {
    const rows = await sql<SearchResultRow[]>`
      select
        id, title, completed, created_at,
        1 - (embedding <=> ${queryVector}::vector) as similarity
      from todos
      where embedding is not null
        and (embedding <=> ${queryVector}::vector) < ${MAX_DISTANCE}
      order by embedding <=> ${queryVector}::vector
      limit ${MAX_RESULTS}
    `;

    return NextResponse.json(rows);
  } catch {
    return NextResponse.json({error: 'Failed to search todos'}, {status: 500});
  }
}
