import type { Args, Module, OptionSpec } from '../../core/types.js'
import { ROLES, type Role } from './types.js'
import { resolveTarget, partitionPositional, type ResolveOptions } from './resolve.js'
import { beginVerb, requireDocument } from './extract.js'
import {
    atTargetPosition,
    completionTargetElement,
    inBrowser,
    keyNames,
    optionTexts,
    targetCompletions
} from './completions.js'
import { storeElements } from './registry.js'
import { getOrCreateOverlay } from './overlay.js'
import { parseKeySpec } from './keys.js'
import { inferRole } from './roles.js'
import {
    type ActRow,
    performClick,
    performDblClick,
    performType,
    performClear,
    performSelect,
    performCheck,
    performPress,
    performHover,
    performFocus
} from './actions.js'

// The ten act-verb Modules (PLAN-dom.md "### Act verbs" + "Files" table:
// "act.ts — the ten act-verb Modules — thin: resolveTarget -> actions ->
// rows"). Every `fn` below follows the same shape: guard, resolve the
// target via `resolve.ts`'s shared rule, call the matching `actions.ts`
// dispatcher, return `[ActRow]` (constraint 1 — always an array, even for a
// single row, so `click @btn` / a later verb's positional splice stays
// legal). Smoke-verified only, per constraint 5.

const strOpt = (v: unknown): string | undefined => (v === undefined ? undefined : String(v))
const numOpt = (v: unknown): number | undefined => (v === undefined ? undefined : Number(v))

/**
 * The completion every act verb offers at its target position (PLAN-dom.md
 * "### Completion hooks": "Act verbs at position 0: registry refs (elN) +
 * candidate names"). Verbs with a trailing argument override this to add
 * their own later-position vocabulary.
 */
const completeTarget = (prefix: string, args: Args): string[] =>
    inBrowser() && atTargetPosition(args) ? targetCompletions(prefix) : []

/**
 * Options every act verb shares, since every act verb resolves its target
 * through `resolveTarget` (PLAN-dom.md: "Implemented once in resolve.ts,
 * used by every verb" + "`-t/--target` single-value option also accepted").
 * `role`/`near`/`exact`/`nth` only matter for the implicit-find fallback
 * inside `resolveTarget`; `quiet` also skips the ~1.2s resolved-element
 * flash resolveTarget does on success.
 */
const TARGETING_OPTIONS: Record<string, OptionSpec> = {
    target: {
        alias: 't',
        type: 'string',
        describe: 'explicit target: a registry ref (elN), a spliced row/handle, or query text run through an implicit find'
    },
    role: {
        alias: 'k',
        type: 'string',
        choices: [...ROLES],
        describe: 'require this inferred role, for the implicit-find target resolution'
    },
    near: { type: 'string', describe: 'rank the implicit-find target nearer to this anchor text' },
    exact: { alias: 'x', type: 'boolean', describe: 'exact normalized match only for the implicit-find target (no fuzzy)' },
    nth: { alias: 'n', type: 'number', describe: 'pick the Nth ranked match for the implicit-find target (1-based)' },
    quiet: { alias: 'q', type: 'boolean', describe: 'skip the onscreen pointer flash' }
}

/** `TARGETING_OPTIONS`' `describe`s, pre-flattened for `help.options` — every act verb's help spreads this in alongside its own verb-specific option docs. */
const TARGETING_HELP: Record<string, string> = Object.fromEntries(
    Object.entries(TARGETING_OPTIONS).map(([k, v]) => [k, v.describe ?? ''])
)

/** Build `resolveTarget`'s `ResolveOptions` from an act verb's own `ctx.args.options` — every act verb carries the same targeting knobs via `TARGETING_OPTIONS`. */
function buildResolveOpts(opts: Record<string, unknown>, consumesRest = false): ResolveOptions {
    return {
        role: strOpt(opts.role) as Role | undefined,
        near: strOpt(opts.near),
        exact: opts.exact === true,
        nth: numOpt(opts.nth),
        quiet: opts.quiet === true,
        consumesRest
    }
}

const isTextControl = (el: Element): boolean => {
    const tag = el.tagName.toLowerCase()
    if (el.getAttribute('contenteditable') === 'true') return true
    const type = tag === 'input' ? (el as HTMLInputElement).type : undefined
    return inferRole(tag, type) === 'textbox'
}

/**
 * Register an arbitrary live element (not necessarily one `find` ever
 * surfaced — e.g. `document.activeElement`) under the registry so it gets a
 * stable ref like any other resolved target, and flash it unless `--quiet`.
 * Used only by `type`'s and `press`'s no-explicit-target fallback below.
 */
function adoptElement(appId: string, el: Element, quiet: boolean): string {
    const refs = storeElements(appId, [el])
    const ref = refs.get(el) as string
    if (!quiet) getOrCreateOverlay(appId).flash({ ref, el })
    return ref
}

// ---------- click / dblclick ----------

export const click: Module<ActRow[]> = {
    help: {
        description: 'click an element (full pointer/mouse event sequence, then activation — checkbox toggle, link navigation, form submit)',
        options: { ...TARGETING_HELP },
        examples: {
            'submit': 'click the best-scoring "submit" match',
            '@btn': 'click a handle saved by an earlier `find … as btn`'
        }
    },
    options: { ...TARGETING_OPTIONS },
    fn: (ctx) => {
        beginVerb(ctx)
        const opts = ctx.args.options
        const { ref, el } = resolveTarget(ctx, buildResolveOpts(opts))
        performClick(ctx.app.id, el)
        return [{ ref, did: 'click' }]
    }
}

export const dblclick: Module<ActRow[]> = {
    help: {
        description: 'double-click an element (click sequence, then a second down/up/click at detail:2, then dblclick)',
        options: { ...TARGETING_HELP },
        examples: {
            'row-3': 'double-click the best-scoring "row-3" match',
            '@item': 'double-click a saved handle'
        }
    },
    options: { ...TARGETING_OPTIONS },
    fn: (ctx) => {
        beginVerb(ctx)
        const opts = ctx.args.options
        const { ref, el } = resolveTarget(ctx, buildResolveOpts(opts))
        performDblClick(ctx.app.id, el)
        return [{ ref, did: 'dblclick' }]
    }
}

// ---------- type ----------

export const typeVerb: Module<ActRow[]> = {
    help: {
        description:
            'type text into a text control, user-event-fidelity (React controlled inputs work): click-focus, then per-character keydown/keypress/beforeinput/input/keyup. No {enter} DSL — use `press` for keys.',
        options: {
            ...TARGETING_HELP,
            delay: 'ms to wait between characters (default: none, synchronous)',
            change: 'fire a trailing `change` event if the value changed (default true; pass false to suppress)'
        },
        examples: {
            'email user@example.com': 'find "email" and type into it',
            // quoted deliberately: the focused-control shortcut is "a single
            // positional is the text", so an unquoted two-word example would
            // instead be read as target + text and run a find for "hello".
            '"hello world"': 'type into whichever text control is currently focused (a single positional = text)'
        }
    },
    options: {
        ...TARGETING_OPTIONS,
        delay: { type: 'number', describe: 'ms to wait between characters (default: none, synchronous)' },
        // NOT `type: 'boolean'`: the core parser treats a boolean option as a
        // bare flag and never consumes a following value, so `--change false`
        // would set change=true and leave the word "false" to be typed into the
        // field. A string option with choices takes the value and documents it.
        change: {
            type: 'string',
            choices: ['true', 'false'],
            describe: 'fire a trailing change event if the value changed (default true)'
        }
    },
    fn: async (ctx) => {
        beginVerb(ctx)
        const opts = ctx.args.options
        const targetOpt = opts.target ?? opts.t
        const partition = partitionPositional(ctx.args.positional)
        const hasExplicitTarget = targetOpt !== undefined || partition.rows.length > 0 || partition.refs.length > 0
        const quiet = opts.quiet === true

        let ref: string
        let el: Element
        let text: string

        if (!hasExplicitTarget && partition.words.length === 1) {
            // "single positional = text" (PLAN-dom.md): type into whatever's
            // already focused rather than treating the lone word as a find query.
            const doc = requireDocument()
            const active = doc.activeElement
            if (!active || active === doc.body || !isTextControl(active)) {
                throw new Error('dom: type needs a target — no text control is focused (try "type <target> <text>")')
            }
            el = active
            ref = adoptElement(ctx.app.id, el, quiet)
            text = partition.words[0]
        } else {
            const resolved = resolveTarget(ctx, buildResolveOpts(opts, true))
            ref = resolved.ref
            el = resolved.el
            text = resolved.rest.join(' ')
        }

        if (!text) throw new Error('dom: type needs text, e.g. "type email hello" or "type hello" (types into the focused field)')

        const delayMs = numOpt(opts.delay)
        // `--change false` arrives as the string 'false'; a bare `--change`
        // still arrives as boolean true (the parser's valueless-flag rule).
        const fireChange = opts.change !== 'false' && opts.change !== false
        const result = await performType(ctx.app.id, el, text, { delayMs, fireChange })

        return [{ ref, did: 'type', value: result.value, changed: result.changed }]
    }
}

// ---------- clear ----------

export const clear: Module<ActRow[]> = {
    help: {
        description: 'clear a text control: focus, beforeinput(deleteContentBackward), nativeSetValue(""), input, change',
        options: { ...TARGETING_HELP },
        examples: {
            'email': 'clear the best-scoring "email" field',
            '@em': 'clear a saved handle'
        }
    },
    options: { ...TARGETING_OPTIONS },
    fn: (ctx) => {
        beginVerb(ctx)
        const opts = ctx.args.options
        const { ref, el } = resolveTarget(ctx, buildResolveOpts(opts))
        const result = performClear(el)
        return [{ ref, did: 'clear', value: result.value, changed: result.changed }]
    }
}

// ---------- select ----------

export const select: Module<ActRow[]> = {
    help: {
        description:
            'choose an <select> option: exact text -> exact value -> substring -> fuzzy (or --index/--value); nativeSetValue + input + change',
        options: {
            ...TARGETING_HELP,
            value: 'match the option query against option values instead of visible text',
            index: 'pick the option at this 1-based index directly',
            add: 'multi-select: append to the current selection instead of replacing it'
        },
        examples: {
            'country Germany': 'find "country" and choose the option matching "Germany"',
            'country --index 3': 'choose the 3rd option of the best-scoring "country" match'
        }
    },
    options: {
        ...TARGETING_OPTIONS,
        value: { type: 'boolean', describe: 'match the option query against option values instead of visible text' },
        index: { type: 'number', describe: 'pick the option at this 1-based index directly' },
        add: { type: 'boolean', describe: 'multi-select: append to the current selection instead of replacing it' }
    },
    fn: (ctx) => {
        beginVerb(ctx)
        const opts = ctx.args.options
        const { ref, el, rest } = resolveTarget(ctx, buildResolveOpts(opts, true))
        const query = rest.join(' ')
        const index = numOpt(opts.index)

        if (!query && index === undefined) {
            throw new Error('dom: select needs an option query, e.g. "select country Germany" or "select country --index 3"')
        }

        const result = performSelect(el, query, { byValue: opts.value === true, index, add: opts.add === true })
        return [{ ref, did: 'select', value: result.value, changed: result.changed }]
    }
}

// ---------- check / uncheck ----------

function makeCheckVerb(desired: boolean, did: 'check' | 'uncheck'): Module<ActRow[]> {
    return {
        help: {
            description: `${did === 'check' ? 'check' : 'uncheck'} a checkbox/radio: no-op if already ${desired ? 'checked' : 'unchecked'}, else click sequence (falls back to a forced nativeSetChecked + input/change if that alone didn't move it)`,
            options: { ...TARGETING_HELP },
            examples: {
                'subscribe': `${did} the best-scoring "subscribe" match`,
                '@cb': `${did} a saved handle`
            }
        },
        options: { ...TARGETING_OPTIONS },
        fn: (ctx) => {
            beginVerb(ctx)
            const opts = ctx.args.options
            const { ref, el } = resolveTarget(ctx, buildResolveOpts(opts))
            const result = performCheck(ctx.app.id, el, desired)
            return [{ ref, did, changed: result.changed }]
        }
    }
}

export const check: Module<ActRow[]> = makeCheckVerb(true, 'check')
export const uncheck: Module<ActRow[]> = makeCheckVerb(false, 'uncheck')

// ---------- press ----------

export const press: Module<ActRow[]> = {
    help: {
        description:
            'press a key (keydown [+keypress if printable] -> keyup, modifiers via "Control+Shift+a" syntax). Untrusted keys run no default browser action, except Enter on a text control inside a <form>, which calls form.requestSubmit() — use `click` for anything else.',
        options: {
            ...TARGETING_HELP,
            repeat: 'repeat the keydown/keypress/keyup sequence this many times (default 1)'
        },
        examples: {
            'Enter': 'press Enter on whichever element is currently focused',
            'email Control+a': 'find "email" and press Control+a on it'
        }
    },
    options: {
        ...TARGETING_OPTIONS,
        repeat: { type: 'number', describe: 'repeat the keydown/keypress/keyup sequence this many times (default 1)' }
    },
    fn: (ctx) => {
        beginVerb(ctx)
        const opts = ctx.args.options
        const targetOpt = opts.target ?? opts.t
        const partition = partitionPositional(ctx.args.positional)
        const hasExplicitTarget = targetOpt !== undefined || partition.rows.length > 0 || partition.refs.length > 0
        const quiet = opts.quiet === true

        let ref: string
        let el: Element
        let keySpecText: string

        if (!hasExplicitTarget && partition.words.length === 1) {
            // "no target -> activeElement/body" (PLAN-dom.md): the lone word
            // is the key spec, not an implicit-find query.
            const doc = requireDocument()
            const active = doc.activeElement
            el = active && active !== doc.body ? active : doc.body
            ref = adoptElement(ctx.app.id, el, quiet)
            keySpecText = partition.words[0]
        } else {
            const resolved = resolveTarget(ctx, buildResolveOpts(opts, true))
            ref = resolved.ref
            el = resolved.el
            keySpecText = resolved.rest[0] ?? ''
        }

        if (!keySpecText) throw new Error('dom: press needs a key spec, e.g. "press Enter" or "press email Enter"')

        const spec = parseKeySpec(keySpecText)
        const repeat = numOpt(opts.repeat) ?? 1
        performPress(el, spec, repeat)

        return [{ ref, did: 'press', value: keySpecText }]
    }
}

// ---------- hover / focus ----------

export const hover: Module<ActRow[]> = {
    help: {
        description: 'hover an element: leave-sequence on whatever was last hovered, then the enter sequence on this one',
        options: { ...TARGETING_HELP },
        examples: {
            'tooltip trigger': 'hover the best-scoring "tooltip trigger" match',
            '@el': 'hover a saved handle'
        }
    },
    options: { ...TARGETING_OPTIONS },
    fn: (ctx) => {
        beginVerb(ctx)
        const opts = ctx.args.options
        const { ref, el } = resolveTarget(ctx, buildResolveOpts(opts))
        performHover(ctx.app.id, el)
        return [{ ref, did: 'hover' }]
    }
}

export const focus: Module<ActRow[]> = {
    help: {
        description: 'focus an element: el.focus(), falling back to dispatching focus+focusin directly if that did not take',
        options: { ...TARGETING_HELP },
        examples: {
            'email': 'focus the best-scoring "email" match',
            '@em': 'focus a saved handle'
        }
    },
    options: { ...TARGETING_OPTIONS },
    fn: (ctx) => {
        beginVerb(ctx)
        const opts = ctx.args.options
        const { ref, el } = resolveTarget(ctx, buildResolveOpts(opts))
        performFocus(el)
        return [{ ref, did: 'focus' }]
    }
}

// ---------- completion hooks ----------

// PLAN-dom.md "### Completion hooks". Wired here rather than inline in each
// module literal so the whole per-verb vocabulary is legible in one place:
// every act verb completes targets at position 0, and the three verbs with a
// meaningful trailing argument add their own after that. `type` deliberately
// offers nothing past its target — the plan calls it out ("`type` → nothing"),
// since free text can't be usefully guessed.
click.complete = completeTarget
dblclick.complete = completeTarget
typeVerb.complete = completeTarget
clear.complete = completeTarget
check.complete = completeTarget
uncheck.complete = completeTarget
hover.complete = completeTarget
focus.complete = completeTarget

/** target, then the named `<select>`'s own option texts. */
select.complete = (prefix, args) => {
    if (!inBrowser()) return []
    if (atTargetPosition(args)) return targetCompletions(prefix)
    return optionTexts(prefix, () => completionTargetElement(args))
}

/**
 * `press [target] <keyspec>`: the key list is offered at BOTH positions,
 * because the documented single-argument form (`press Enter`) puts a key
 * exactly where every other verb puts its target.
 */
press.complete = (prefix, args) => {
    if (!inBrowser()) return []
    if (!atTargetPosition(args)) return keyNames(prefix)
    return [...keyNames(prefix), ...targetCompletions(prefix)]
}
