import {NextResponse} from 'next/server';

import {sql} from '@/db';
import type {TodoRow} from '@/db/types';
import {createTodoSchema, invalidRequest} from '@/lib/api-contract';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const rows = await sql<TodoRow[]>`
      select * from todos order by created_at desc
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
      returning *
    `;

    return NextResponse.json(created, {status: 201});
  } catch {
    return NextResponse.json({error: 'Failed to create todo'}, {status: 500});
  }
}
