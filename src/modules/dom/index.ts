import type { Module, Modules } from '../../core/types.js'
import find from './find.js'
import { click, dblclick, typeVerb, clear, select, check, uncheck, press, hover, focus } from './act.js'
import { on, off, events } from './listen.js'

// `peprn/dom` package entry (PLAN-dom.md "### Export shape and module tree").
// Phase 3 landed `find`; phase 4 added the ten act verbs (act.ts); phase 5
// adds the last 3 leaves (`on`, `off`, `events`, listen.ts) below, completing
// all 14.

export { find, click, dblclick, typeVerb, clear, select, check, uncheck, press, hover, focus, on, off, events }

/**
 * Every leaf, for top-level spreading: `modules: { match, ...domModules }`
 * mounts every dom verb as a terse top-level command. `typeVerb`'s REPL name
 * is `'type'` — the exported identifier is renamed only to dodge the `type`
 * keyword's special meaning in an import-specifier position (`import { type
 * X }`), not the command surface. (This is also where `clear`/`on`/`events`
 * hit their top-level-name collision with any other module the consumer
 * spreads — the plan's documented tradeoff: consumer spread order decides,
 * and the namespaced `dom` mount below is always available as the
 * collision-free alternative.)
 */
export const domModules: Modules = {
    find,
    click,
    dblclick,
    type: typeVerb,
    clear,
    select,
    check,
    uncheck,
    press,
    hover,
    focus,
    on,
    off,
    events
}

/**
 * `dom` — the namespaced parent (`dom find …`, `dom click …`, …). Deliberately
 * fn-less: `executeChain` skips modules without an `fn` and they contribute no
 * key to the composite result (src/core/engine.ts:24-25), so e.g. `dom find …
 * as h` registers find's own row array as the handle, and the envelope stays
 * `{ 'dom find': rows }` with no extra `dom` noise key.
 */
const dom: Module = {
    help: {
        description: 'find and drive elements on this page (testing-library-style queries as REPL verbs)'
    },
    submodules: domModules
}

export default dom
