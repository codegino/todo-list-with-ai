import {NextResponse} from 'next/server';
import {z} from 'zod';

export const createTodoSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(255),
});

export const idSchema = z.uuid('Invalid todo id');

export const todoSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  completed: z.boolean(),
  createdAt: z.iso.datetime(),
});

export const todoListSchema = z.array(todoSchema);

export type Todo = z.infer<typeof todoSchema>;

// The one shared response helper. `details` maps each rejected field to its messages.
export function invalidRequest(error: z.ZodError) {
  return NextResponse.json(
    {error: 'Validation failed', details: z.flattenError(error).fieldErrors},
    {status: 400},
  );
}
