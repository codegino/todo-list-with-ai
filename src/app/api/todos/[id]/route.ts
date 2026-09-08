import {NextResponse} from 'next/server';

import {sql} from '@/db';
import {idSchema} from '@/lib/api-contract';

export const runtime = 'nodejs';

type RouteContext = {params: Promise<{id: string}>};

export async function DELETE(_request: Request, {params}: RouteContext) {
  const {id} = await params;

  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({error: 'Invalid todo id'}, {status: 400});
  }

  try {
    const deleted = await sql`
      delete from todos where id = ${id} returning id
    `;

    if (deleted.length === 0) {
      return NextResponse.json({error: 'Todo not found'}, {status: 404});
    }

    return new NextResponse(null, {status: 204});
  } catch {
    return NextResponse.json({error: 'Failed to delete todo'}, {status: 500});
  }
}
