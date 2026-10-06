/**
 * Bulk actions on the dashboard are many independent writes, not one
 * transaction. The row-level policies are written per row, and a delete has to
 * enumerate its uploads while its row still exists, so there is no single
 * statement that does the whole job. The honest result is therefore a split —
 * these went through, these did not and here is why — and one refusal must not
 * stop the rest of the batch.
 */

export interface SettledBatch<T> {
  /** Items whose job resolved, in the order they were passed in. */
  done: T[]
  /** Items whose job threw, in the order they were passed in. */
  failed: { item: T; message: string }[]
}

export interface SettleOptions {
  /** Jobs in flight at once. Small on purpose: each one is several round trips. */
  concurrency?: number
  /** Called after every job, whichever way it went. */
  onProgress?: (finished: number, total: number) => void
}

/** PostgREST errors are plain objects with a message, not Error instances. */
export function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message: unknown }).message
    if (typeof message === 'string' && message.length > 0) return message
  }
  return String(err)
}

/** Runs `run` once per item, never more than `concurrency` at a time, and never throws. */
export async function settleEach<T>(
  items: readonly T[],
  run: (item: T) => Promise<unknown>,
  options: SettleOptions = {}
): Promise<SettledBatch<T>> {
  const total = items.length
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? 3))
  const outcomes: ({ ok: true } | { ok: false; message: string })[] = new Array(total)
  let next = 0
  let finished = 0

  const worker = async () => {
    while (next < total) {
      const index = next++
      try {
        await run(items[index])
        outcomes[index] = { ok: true }
      } catch (err) {
        outcomes[index] = { ok: false, message: errorMessage(err) }
      }
      finished++
      options.onProgress?.(finished, total)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker))

  const done: T[] = []
  const failed: SettledBatch<T>['failed'] = []
  outcomes.forEach((outcome, index) => {
    if (outcome.ok) done.push(items[index])
    else failed.push({ item: items[index], message: outcome.message })
  })
  return { done, failed }
}

/**
 * The split for a single `.update().in('id', ids).select('id')`. RLS filters a
 * row it will not let you change out of the statement rather than failing it,
 * so the only sign of a refusal is an id that did not come back.
 */
export function splitReturned(
  ids: readonly string[],
  returned: readonly { id: string }[] | null | undefined,
  missingMessage: string
): SettledBatch<string> {
  const changed = new Set((returned ?? []).map((row) => row.id))
  return {
    done: ids.filter((id) => changed.has(id)),
    failed: ids.filter((id) => !changed.has(id)).map((id) => ({ item: id, message: missingMessage })),
  }
}
