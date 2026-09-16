import {NextResponse, after} from 'next/server';

import {sql} from '@/db';
import type {TodoRow} from '@/db/types';
import {createTodoSchema, invalidRequest} from '@/lib/api-contract';
import {embed, toVector} from '@/lib/embeddings';

export const runtime = 'nodejs';

export async function GET() {
  try {
    // Every column except `embedding`. `select *` was fine until the table
    // grew a 1536-dimension vector: that is ~30KB of JSON per row, for a field
    // the UI never reads and `todoSchema` would silently strip. Adding a wide
    // column is exactly when `select *` becomes a bandwidth bug.
    const rows = await sql<TodoRow[]>`
      select id, title, completed, created_at
      from todos
      order by created_at desc
    `;

    return NextResponse.json(rows);
  } catch {
    return NextResponse.json({error: 'Failed to load todos'}, {status: 500});
  }
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({error: 'Malformed JSON body'}, {status: 400});
  }

  const parsed = createTodoSchema.safeParse(body);

  if (!parsed.success) {
    return invalidRequest(parsed.error);
  }

  const {title} = parsed.data;

  try {
    const [created] = await sql<TodoRow[]>`
      insert into todos (title)
      values (${title})
      returning id, title, completed, created_at
    `;

    /**
     * Creating a todo is the core feature; embedding it is not. Putting the
     * OpenAI call in front of the insert would mean an OpenAI outage takes
     * down todo creation, so the row is written and returned first and the
     * vector is filled in after the response has already gone out.
     *
     * `after()` is best-effort, not a queue. There are no retries, and if the
     * process dies mid-flight the work is simply lost with no record that it
     * was owed. That is what POST /api/todos/backfill is for.
     */
    after(async () => {
      try {
        const embedding = await embed(created.title);

        await sql`
          update todos
          set embedding = ${toVector(embedding)}::vector
          where id = ${created.id}
        `;
      } catch (error) {
        // oxlint-disable-next-line no-console -- the only signal this failed
        console.error(`Failed to embed todo ${created.id}`, error);
      }
    });

    return NextResponse.json(created, {status: 201});
  } catch {
    return NextResponse.json({error: 'Failed to create todo'}, {status: 500});
  }
}
