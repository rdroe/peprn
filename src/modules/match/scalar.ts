import type { Module } from '../../core/types.js'

/**
 * `match scalar` — pairwise equality over two parallel option arrays.
 *
 * Rows are produced for every index in `0..max(l.length, r.length) - 1`, so a
 * ragged pair yields `undefined` on the shorter side rather than truncating.
 */
const scalar: Module = {
    help: {
        description: 'test whether the supplied scalar pairs are equal',
        examples: {
            '-l 1 2 3 -r 1 2 4':
                'test whether 1 equals 1, 2 equals 2, and 3 equals 4; output contains a map and list of equalities.',
            '--left 1 2 3 --right 1 2 4':
                'test whether 1 equals 1, 2 equals 2, and 3 equals 4; output contains a map and list of equalities.'
        }
    },
    options: {
        l: { alias: 'left', array: true, describe: 'comparison value' },
        r: { alias: 'right', array: true, describe: 'comparison value' }
    },
    fn: (ctx) => {
        const l = ctx.args.options.l as unknown[] | undefined
        const r = ctx.args.options.r as unknown[] | undefined
        if (l === undefined || r === undefined) {
            throw new Error('match scalar requires -l/--left and -r/--right')
        }
        const rows: { index: number; match: boolean; left: unknown; right: unknown }[] = []
        const len = Math.max(l.length, r.length)
        for (let i = 0; i < len; i++) {
            rows.push({ index: i, match: l[i] === r[i], left: l[i], right: r[i] })
        }
        return rows
    }
}

export default scalar
