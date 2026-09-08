import {NextResponse} from 'next/server';

import {sql} from '@/db';
import type {TodoRow} from '@/db/types';
import {idSchema} from '@/lib/api-contract';

export const runtime = 'nodejs';

type RouteContext = {params: Promise<{id: string}>};

export async function POST(_request: Request, {params}: RouteContext) {
  const {id} = await params;

  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({error: 'Invalid todo id'}, {status: 400});
  }

  try {
    const [toggled] = await sql<TodoRow[]>`
      update todos
      set completed = not completed
      where id = ${id}
      returning *
    `;

    if (!toggled) {
      return NextResponse.json({error: 'Todo not found'}, {status: 404});
    }

    return NextResponse.json(toggled);
  } catch {
    return NextResponse.json({error: 'Failed to toggle todo'}, {status: 500});
  }
}
