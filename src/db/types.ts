import type {Todo} from '@/lib/api-contract';

/**
 * The shape `postgres` hands back, which is NOT the shape clients receive.
 * `created_at` is a timestamptz, and postgres.js parses those into `Date`
 * objects — it only becomes a string once `NextResponse.json` serializes it.
 *
 * Hand-written to mirror migrations/001_init.sql. Nothing enforces this, and
 * `sql<TodoRow[]>` is an unchecked assertion: if a column changes there and
 * not here, TypeScript will happily lie to you.
 */
export type TodoRow = Omit<Todo, 'createdAt'> & {createdAt: Date};
