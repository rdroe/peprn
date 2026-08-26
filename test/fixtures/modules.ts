import type { Invocation, Module, Modules } from '../../src/core/types.js'

/** Every option shape: alias, array+alias, typed string/number/boolean. */
export const echo: Module = {
    options: {
        a: { alias: 'alpha' },
        list: { alias: 'l', array: true },
        n: { type: 'number' },
        s: { type: 'string' },
        v: { alias: 'verbose', type: 'boolean' },
    },
    help: {
        description: 'echo parsed args',
        examples: { '-a 1': 'echoes -a' },
    },
    fn: (ctx: Invocation) => ({
        options: ctx.args.options,
        positional: ctx.args.positional,
        wildcards: ctx.args.wildcards,
    }),
}

/** Returns its `-x` option when present, else its first positional. */
export const pass: Module = {
    options: { x: {} },
    fn: (ctx: Invocation) =>
        ctx.args.options.x !== undefined ? ctx.args.options.x : ctx.args.positional[0],
}

/** Returns the `--xs` array option (always an array). */
export const list: Module = {
    options: { xs: { array: true } },
    fn: (ctx: Invocation) => ctx.args.options.xs ?? [],
}

/** Constant object result. */
export const obj: Module = {
    fn: () => ({ k: 1 }),
}

/** Always throws. */
export const boom: Module = {
    fn: () => {
        throw new Error('boom!')
    },
}

/** Sleeps for `positional[0]` ms, then resolves `'waited:<ms>'`. */
export const wait: Module = {
    fn: async (ctx: Invocation) => {
        const ms = Number(ctx.args.positional[0] ?? 0)
        await new Promise((r) => setTimeout(r, ms))
        return 'waited:' + ms
    },
}

/** fn-less (synthetic) parent with one leaf. */
export const syn: Module = {
    submodules: {
        leaf: { fn: () => 'leaf' },
    },
}

/** fn-less parent whose only child is a wildcard. */
export const dyn: Module = {
    submodules: {
        '$': {
            options: { d: {} },
            fn: (ctx: Invocation) => ctx.args.wildcards,
        },
    },
}

/** Option with `choices` + `describe`, for completion and the manual. */
export const pick: Module = {
    options: { color: { choices: ['red', 'green'], describe: 'a color' } },
    fn: (ctx: Invocation) => ctx.args.options.color ?? null,
}

/** Dynamic value completion for its argument position. */
export const dynv: Module = {
    complete: (prefix: string) => ['alpha', 'beta'].filter((s) => s.startsWith(prefix)),
    fn: (ctx: Invocation) => ctx.args.positional[0] ?? null,
}

export const fixtures: Modules = {
    echo,
    pass,
    list,
    obj,
    boom,
    wait,
    syn,
    dyn,
    pick,
    dynv,
}
