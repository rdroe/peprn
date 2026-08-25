import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { sleep, pollUntil, PollTimeoutError } from '../src/modules/async/poll.js'

// `poll.ts` touches no DOM — only timers — so unlike the rest of peprn/dom's
// impure layer it is directly unit-testable in node. Durations are kept short
// and assertions use generous lower bounds only, so a loaded machine cannot
// make these flaky.

describe('async: sleep', () => {
    test('resolves no earlier than the requested duration', async () => {
        const started = Date.now()
        await sleep(60)
        assert.ok(Date.now() - started >= 55, 'expected sleep to actually wait')
    })

    test('a zero duration still resolves', async () => {
        await sleep(0)
    })
})

describe('async: pollUntil', () => {
    test('an already-true condition costs no extra attempt', async () => {
        let calls = 0
        const value = await pollUntil(
            () => {
                calls += 1
                return 'ready'
            },
            'a value'
        )
        assert.equal(value, 'ready')
        assert.equal(calls, 1, 'expected the first attempt to run immediately')
    })

    test('retries until the attempt produces a value', async () => {
        let calls = 0
        const value = await pollUntil(
            () => {
                calls += 1
                return calls >= 3 ? 'late' : undefined
            },
            'a value',
            { intervalMs: 10 }
        )
        assert.equal(value, 'late')
        assert.equal(calls, 3)
    })

    test('a throw means "not yet", not failure', async () => {
        let calls = 0
        const value = await pollUntil(
            () => {
                calls += 1
                if (calls < 3) throw new Error('no match for "x"')
                return 'arrived'
            },
            'a value',
            { intervalMs: 10 }
        )
        assert.equal(value, 'arrived')
    })

    test('timing out surfaces the last error, so the message says what was wrong', async () => {
        await assert.rejects(
            pollUntil(
                () => {
                    throw new Error('dom: no match for "ghost"')
                },
                '"ghost"',
                { timeoutMs: 60, intervalMs: 10 }
            ),
            (err: Error) => {
                assert.ok(err instanceof PollTimeoutError)
                assert.match(err.message, /no match for "ghost"/)
                assert.match(err.message, /gave up after 60ms/)
                return true
            }
        )
    })

    test('timing out with no error at all still names what was awaited', async () => {
        await assert.rejects(
            pollUntil(() => undefined, '"a button"', { timeoutMs: 50, intervalMs: 10 }),
            (err: Error) => {
                assert.ok(err instanceof PollTimeoutError)
                assert.match(err.message, /timed out after 50ms waiting for "a button"/)
                return true
            }
        )
    })

    test('a condition that never holds does not return early', async () => {
        const started = Date.now()
        await assert.rejects(pollUntil(() => undefined, 'x', { timeoutMs: 80, intervalMs: 10 }))
        assert.ok(Date.now() - started >= 70, 'expected the full timeout to elapse')
    })
})
