// Public core entry point: shared contracts + every core building block.

/**
 * ## peprn command grammar
 *
 * The language users type at the prompt. This is a runtime string grammar —
 * **no type in this package describes it** — so read this before composing
 * command strings for `app.run(...)`.
 *
 * ```text
 * command sub1 sub2  positional "quoted words"  --opt val -a val  --flag  as name
 * \___ module path _/ \_____ positionals _____/ \____ options ___/ \____/ \_ handle _/
 * ```
 *
 * | Form | Meaning |
 * |---|---|
 * | `cmd sub arg`     | walk the module tree while tokens match; the rest are arguments |
 * | `--opt value`     | long option; exactly one value unless declared `array` |
 * | `-o value`        | short alias |
 * | `--flag`          | a `boolean` option never consumes a value (valueless ⇒ `true`) |
 * | `--arr a b c`     | an `array` option collects until the next flag; repeats append |
 * | `"two words"`     | quotes group one token; both `"` and `'` work |
 * | `\x`              | backslash escapes the next character, inside and outside quotes |
 * | `@name`           | await handle `name`, splice its **resolved value** (by reference) |
 * | `cmd … as name`   | register the result under `name` **without blocking** the next line |
 * | newline           | one task per line; lines run in order unless bound with `as` |
 *
 * Gotchas, all pinned by tests:
 *
 * - **`as` starts work, `@` waits for it.** A line without `as` completes before the
 *   next begins; a line with `as` blocks nothing until something says `@name`.
 * - **`@` in a list slot** (positionals, array options) splices an array
 *   element-by-element, and throws `InjectionError` on a lone non-scalar object.
 *   This is why every built-in verb returns an array.
 * - **`@` must start a token**: `user@example.com` is a literal. Escape as `\@`.
 * - **Unquoted numbers coerce** (`1` → `1`), quoted ones do not (`"1"` → `'1'`).
 *   Negative numbers stay values, not flags.
 * - Unknown flags are accepted untyped rather than rejected.
 * - A `'$'` submodule name matches any single token → `ctx.args.wildcards`.
 * - `--help`/`-h` prints a summary; `--man` renders the full page.
 *
 * For a complete, always-current reference **including your own modules**:
 *
 * ```ts
 * renderManText(buildManIndex(modules, 'my-cli'))
 * renderManText(buildManPage(modules, ['dom', 'find']))
 * ```
 *
 * Built-in trees: `peprn/dom` (14 DOM verbs), `peprn/match`, `peprn/async`.
 * Full prose docs: https://github.com/rdroe/peprn#readme
 */
export * from './types.js'
export * from './errors.js'

export { createApp } from './app.js'
export { buildProgram } from './program.js'
export { tokenizeLine } from './tokenizer.js'
export { parseLine, walkStem } from './parser.js'
export { injectArgs, runProgram } from './scheduler.js'
export { HandleRegistry } from './handles.js'
export { getHelp } from './help.js'
export { executeChain } from './engine.js'
export { complete } from './complete.js'
export { buildManPage, buildManIndex, renderManText, makeManModule } from './man.js'
export { createMemoryHistory, createHistorySession, makeHistoryModule } from './history.js'
