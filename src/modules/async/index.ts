import type { Module, Modules } from '../../core/types.js'
import { sleep } from './poll.js'

// `peprn/async` — timing verbs that are not tied to a browser.
//
// Sibling to `peprn/match` and `peprn/dom`, and deliberately separate from the
// latter: a timer has nothing to do with a document, so gating it behind
// `peprn/dom`'s `requireDocument()` would make `sleep 500` throw in a node
// shell for no reason. `poll.ts` additionally backs every `--waitfor` in
// `peprn/dom`, which imports it directly.

export { sleep, pollUntil, PollTimeoutError, DEFAULT_TIMEOUT_MS, DEFAULT_INTERVAL_MS } from './poll.js'
export type { PollOptions } from './poll.js'

interface SleptRow {
    slept: number
}

const MAX_SLEEP_MS = 600_000

/**
 * `sleep <ms>` — pause a task for a fixed duration.
 *
 * Returns an array like every other verb (the scheduler splices an array
 * handle element-by-element into a positional, so `[SleptRow]` keeps
 * `sleep 200 as s` / `@s` legal), and takes its duration as a positional so
 * the common form stays `sleep 500` rather than `sleep --ms 500`.
 */
const sleepVerb: Module<SleptRow[]> = {
    help: {
        description: 'pause for a fixed number of milliseconds before the next task runs',
        options: {
            ms: 'duration in milliseconds; the bare positional form (`sleep 500`) is usually clearer'
        },
        examples: {
            '500': 'pause for half a second',
            '--ms 1500': 'pause for 1.5 seconds'
        }
    },
    options: {
        ms: { type: 'number', describe: 'duration in milliseconds' }
    },
    fn: async (ctx) => {
        const positional = ctx.args.positional[0]
        const raw = ctx.args.options.ms ?? positional

        if (raw === undefined) {
            throw new Error('async: sleep needs a duration in ms, e.g. "sleep 500"')
        }

        const ms = Number(raw)
        if (!Number.isFinite(ms) || ms < 0) {
            throw new Error(`async: sleep expects a non-negative number of ms, got "${String(raw)}"`)
        }
        if (ms > MAX_SLEEP_MS) {
            throw new Error(`async: sleep is capped at ${MAX_SLEEP_MS}ms (asked for ${ms}ms)`)
        }

        await sleep(ms)
        return [{ slept: ms }]
    }
}

export { sleepVerb as sleepModule }

/** every leaf by name, for top-level spreading: `modules: { ...asyncModules }` */
export const asyncModules: Modules = { sleep: sleepVerb }

/** fn-less parent, so `async sleep 500` works when mounted namespaced */
const asyncParent: Module = {
    help: {
        description: 'timing verbs: pause a task, independent of any browser'
    },
    submodules: asyncModules
}

export default asyncParent
