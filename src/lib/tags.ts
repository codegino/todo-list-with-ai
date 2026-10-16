const apiKey = process.env.OPENROUTER_API_KEY;

if (!apiKey) {
  throw new Error('OPENROUTER_API_KEY is not set. Copy .env.example to .env.');
}

/**
 * The labels, and when each one applies. That is the whole configuration.
 *
 * The "choose when" text is what the model actually reads, so it is worth more
 * care than the key. A real app would keep these in a `labels` table; three
 * fixed labels do not need one.
 */
export const TAGS = {
  groceries: 'Buying food, drinks, or household supplies from a store or market.',
  chores:
    'A task done in or around the home, like cleaning, laundry, dishes, cooking, repairs, or taking out the trash.',
  work: 'Related to a job or career, like meetings, reports, emails to colleagues, or deadlines.',
} as const;

export type Tag = keyof typeof TAGS;

/**
 * A tag is attached when the model says it applies with at least this
 * probability. Picked by eye on a handful of todos, the same way the search
 * cutoff was. "Buy dish soap" scores ~0.7 for chores, right on the line.
 */
export const TAG_THRESHOLD = 0.7;

/**
 * Pinned on purpose. The threshold is tuned to this model's probabilities, so
 * `~typesafe/jev-latest` could quietly move them under you.
 */
export const TAG_MODEL = 'typesafe/jev-1.14';

/**
 * Short, because this call sits in front of the insert. If the model is slow
 * or down, the todo is created without tags rather than not at all.
 */
const TIMEOUT_MS = 3_000;

const ENDPOINT = 'https://openrouter.ai/api/alpha/decisions';

type DecisionsResponse = {
  answers: Record<Tag, {type: 'noul'; noul: number}>;
};

/**
 * One yes/no question per tag, all in a single request. Jev answers each one
 * independently with a probability, so a todo can get zero, one, or several
 * tags.
 */
const questions = Object.fromEntries(
  Object.entries(TAGS).map(([tag, chooseWhen]) => [
    tag,
    {
      type: 'noul',
      instructions: `Does the todo belong in "${tag}"? Choose it when: ${chooseWhen}`,
    },
  ]),
);

/**
 * Title in, tags out. Throws on failure; the caller decides what that means.
 */
export async function classify(title: string): Promise<Tag[]> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({model: TAG_MODEL, state: {title}, questions}),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter decisions failed: ${response.status} ${await response.text()}`);
  }

  const {answers} = (await response.json()) as DecisionsResponse;

  return (Object.keys(TAGS) as Tag[]).filter(tag => answers[tag].noul >= TAG_THRESHOLD);
}
