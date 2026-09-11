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

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Search query is required').max(255),
});

/**
 * AI search returns a different shape than the list endpoint: the same todo,
 * plus how close it was to the query. The score is part of the contract on
 * purpose — it is the only way to see *why* a result ranked where it did.
 *
 * Cosine similarity, so 1 is identical and 0 is unrelated.
 */
export const searchResultSchema = todoSchema.extend({
  similarity: z.number(),
});

export const searchResultListSchema = z.array(searchResultSchema);

export type SearchResult = z.infer<typeof searchResultSchema>;

// The one shared response helper. `details` maps each rejected field to its messages.
export function invalidRequest(error: z.ZodError) {
  return NextResponse.json(
    {error: 'Validation failed', details: z.flattenError(error).fieldErrors},
    {status: 400},
  );
}
