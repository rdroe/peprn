// The timing primitives behind `sleep` and every `--waitfor`. Deliberately
// free of DOM and of peprn's module types: `pollUntil` takes a plain attempt
// function, so the same core serves "wait for an element to render" today and
// "wait for a fetch to settle" or "wait for a handle" later, without either
// caller knowing about the other.

/** Resolve after `ms`. The one place a timer is created, so tests and callers share it. */
export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export interface PollOptions {
    /** give up after this many ms (default 5000) */
    timeoutMs?: number
    /** ms between attempts (default 100) */
    intervalMs?: number
}

export const DEFAULT_TIMEOUT_MS = 5000
export const DEFAULT_INTERVAL_MS = 100

/** Thrown when `pollUntil` runs out of time; carries the last failure so callers can report why. */
export class PollTimeoutError extends Error {
    readonly lastError: unknown
    constructor(message: string, lastError: unknown) {
        super(message)
        this.name = 'PollTimeoutError'
        this.lastError = lastError
    }
}

/**
 * Run `attempt` until it produces a value, then return it.
 *
 * "Produces a value" means: returns something other than `undefined` without
 * throwing. Throwing is treated as "not yet" rather than as failure, which is
 * what lets a `find` that throws `no match for …` be polled directly with no
 * adapter — the same convention `@testing-library`'s `waitFor` uses.
 *
 * The first attempt runs immediately, so a condition that is already true
 * costs nothing. On timeout the last error is re-thrown when there was one
 * (its message says what was actually wrong), otherwise a `PollTimeoutError`
 * carrying `label`.
 */
export async function pollUntil<T>(
    attempt: () => T | undefined,
    label: string,
    opts: PollOptions = {}
): Promise<T> {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS
    const deadline = Date.now() + timeoutMs

    let lastError: unknown

    for (;;) {
        try {
            const result = attempt()
            if (result !== undefined) return result
            lastError = undefined
        } catch (err) {
            lastError = err
        }

        if (Date.now() >= deadline) {
            if (lastError instanceof Error) {
                throw new PollTimeoutError(`${lastError.message} (gave up after ${timeoutMs}ms)`, lastError)
            }
            throw new PollTimeoutError(`dom: timed out after ${timeoutMs}ms waiting for ${label}`, lastError)
        }

        await sleep(Math.min(intervalMs, Math.max(0, deadline - Date.now())))
    }
}
