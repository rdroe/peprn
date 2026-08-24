# peprn v1.0.0 — ground-up rewrite plan

## EXECUTION STATUS (resume point)

Execution began, then plan mode re-engaged mid-Phase-0. Current repo state:

- Branch **`v1`** created and checked out (branched from `160c728` on `main`).
- **Teardown DONE**: 50 files staged as deletions — old `src/`, `examples/`,
  `public/`, `build.js`, root `index.html`, `jest.config.js`, `tsconfig.test.json`,
  `tsconfig.json`. Uncommitted.
- Empty directory skeleton created: `src/{core,node,browser,react,modules/match}`,
  `examples/{node,browser,react-generator}`, `scripts`, `test/{fixtures,integration}`.
- **No source files written yet.** Phase 0's contracts (`core/types.ts`,
  `core/errors.ts`) and infra (`package.json`, tsconfigs,
  `scripts/build-examples.mjs`) are still to do.
- Survivors in the working tree: `package.json` (still 0.4.21), `README.md` (still
  0.4.x), `PLAN.md`, `LICENSE`, `eslint.config.mjs`, `yarn.lock`, `node_modules/`.
- **Nothing is lost**: `main` is untouched at `160c728`. Recover with
  `git checkout main`, or `git checkout -- .` on `v1`.

**Resume from Phase 0 step 2** (write P0 contracts + P16 infra), then Phase 1's
18-agent fan-out.

### Execution decisions (settled at resume)

- **Repo dev tooling: npm.** Delete `yarn.lock`, `.yarnrc.yml`, `.yarn/`. The
  *published package* stays package-manager agnostic — that is a property of the
  artifact, not the dev tool, and the v1.0.0 sketch already guarantees it: an
  `exports` map with conditions, `files: ["dist"]` (no lockfile shipped), **no**
  install/prepare lifecycle scripts, and `engines` naming node only (drop 0.4.x's
  `"yarn": ">=2.0.0"` engine). Consumers install with npm, yarn, pnpm, or bun
  identically. The react generator shells `npm pack`/`npm install` because it
  scaffolds a throwaway demo, not because the library requires npm.
- **ESLint: dropped entirely.** Delete `eslint.config.mjs`; no eslint or
  typescript-eslint devDeps. `strict` TypeScript is the only static gate — one
  fewer failure mode across 18 parallel agents.
- **Phase 2 autonomy: run to green.** Iterate ordered verification + per-packet fix
  agents without checkpointing; report once at the end. Stop early and report only
  if a failure indicates the *spec* is wrong rather than an implementation.
- **Browser smoke: driven via chrome-devtools.** Serve the example, type commands,
  screenshot the ghost overlay and the man HTML page, confirm localStorage history
  survives reload — so the two new visual features ship verified, not assumed.

## Context

peprn 0.4.x (parse/evaluate/print/repeat nested subcommands, node + browser) works —
commit `1fbd6d7` fixed the last known defects and is the final 0.4.x — but the core
evaluator is accreted patchwork: a module-global `shared.queue` drained by side-effects,
a `dataWait` map keyed on raw input strings resolved by "longest key wins", multiline
lineation smuggled through the user's own argv as `--peprn:multilineIndex` options and
re-read with a regex, a `successiveCalls` promise map + barrier that once self-deadlocked
and was patched rather than redesigned. Exploration confirmed the multiline feature was
never actually sequential (queue drains once per *module*, fire-and-forget, cross-app),
and found `--serial` — a fossil of an abandoned attempt at exactly the user-typed
concurrency this rewrite centers on.

v1 is a clean-room rewrite: same spirit as the README promises (a starting point, not a
constraint), with **user-specifiable asynchronicity via named handles** designed in from
the start, plus two new capabilities: **type-ahead completion** (browser ghost text +
server Tab completion) and a real **manual** (`man` command, text on server / HTML in
browser). The plan below is decomposed into precise work packets executable in parallel
by low-effort agents.

## Settled decisions

| Decision | Choice |
|---|---|
| Version | **1.0.0** (major bump; 0.4.21 last of 0.4.x). Rewrite on branch `v1`, merge to `main` when integration passes. |
| Clean room | Delete old `src/`, `examples/`, `public/`, `build.js`, root `index.html`, jest configs. README promises may be broken/augmented for the better. |
| Async model | **Named handles**: `cmd … as name` starts without blocking; `@name` awaits that result and splices the **value** (never re-stringified) into the parsed args; un-annotated lines run sequentially; handles persist across prompts. |
| Surfaces | Node/bun REPL (own readline loop — NOT `node:repl`; bun's is a stub), vanilla browser app, react bindings in a separate `peprn/react` entry (react never imported by browser core), react example generator (plain node script, `npm pack` local install, `--force` guard). |
| Tooling | **Zero runtime deps, ESM-only**, TypeScript ~5.5, `node:test`; esbuild + http-server as devDeps only. Node ≥18.17 and bun. |
| Type-ahead | Core completion engine; **ghost-text overlay** in browser (fish-style, Tab/→ accepts); readline `completer` (Tab) on node. Sources in v1.0: command paths + options, `@handles`, history prefix (browser only), per-option `choices` + module `complete()`. |
| Manual | **`man` command** (`man`, `man match scalar`) + **`--man` flag as alias**, one data model (`ManPage`); **text renderer on server, HTML renderer in browser** (linked subcommands). `--help`/`-h` stays as the quick single-level summary. |
| Semantics | Per-task settlement (one failing parallel task never erases siblings); dataHandler fires once per task with the composite README-shaped result + task metadata; `app.run(text, { internal })` replaces `fakeCli`; identical timing semantics on all platforms. |

## Kill list (must not reappear)

`shared.queue`; `dataWait` + longest-key; `--peprn:*` argv injection + `parseLine` regex;
`--peprn:automated true` string protocol; `allCalledProm`/`successiveCalls`/snapshot
patch; `apps` singleton mutation; global `argsMatchers`; zod (its only real work is ~15
lines of coercion + error duck-typing); string-argv; dexie (opens IndexedDB at import
time); shelljs/`util/cli.ts`; ts-node/source-map-support/react-dom/@testing-library as
deps; `zodStore`; `restarter`; `Module.validate`; `strlog`; universal
`--commands`/`--names`/`c:c`/`c:n` (vestigial; `-c:c` corrupts the command stem); the
quotation-mark ban; the `isNode()` await-vs-return timing split; 100ms polling react
hooks; vendored yarn.locks in published src; `"main": "nyargs"`-style packaging lies.

## Kept behaviors (reimplemented)

README result contract `{ 'match scalar': [...], match: 4 }` (childmost-first keys;
parent = flattened child count); `$` wildcard submodules; purely syntactic modules
(no fn); option specs alias/array/**type now honored**, canonical names only in output;
quoting now supported; `--help`/`-h` quick summary; DOM contract `#<id>` / `#<id>-out`
+ injected default UI (`.peprn-default*`); Enter runs / Shift+Enter newline;
Alt+ArrowUp/Down history with `history` module + per-app ignore list; `hideOutput` /
`showOutput` scoped to own output; `catch`/`init`/`preprocessInput`/userEffects (with
matchers)/userKeyEffects; storage-neutral history (localStorage browser / file node);
`createApp` returns a real handle with `dispose()`.

---

# SPECIFICATION

Final tree:

```
src/core/    types.ts errors.ts tokenizer.ts parser.ts program.ts help.ts man.ts
             complete.ts engine.ts handles.ts scheduler.ts history.ts app.ts index.ts
src/node/    fileHistory.ts shell.ts index.ts
src/browser/ history.ts defaultUi.ts defaultModules.ts dom.ts ghost.ts man.ts index.ts
src/react/   index.ts
src/modules/match/ index.ts scalar.ts
examples/node/index.mjs
examples/browser/index.html  examples/browser/main.mjs   (bundle.js generated)
examples/react-generator/generate.mjs
scripts/build-examples.mjs
test/fixtures/modules.ts  test/fixtures/helpers.ts
test/*.test.ts  test/integration/repl.test.ts  test/generator.test.ts
package.json tsconfig.json tsconfig.build.json tsconfig.test.json README.md
```

ESM TypeScript, explicit `.js` extensions in imports (`moduleResolution: NodeNext`).
Import rule for every packet: `core/types.ts` + `core/errors.ts` always allowed;
anything else only if listed in the packet. Tests may also import `node:test`,
`node:assert/strict`, and listed fixtures.

## Packet DAG

| Packet | Contents | Depends on |
|---|---|---|
| P0 | core/types.ts, core/errors.ts | — |
| P16 | package.json, tsconfigs, scripts/build-examples.mjs | — |
| P1 | test/fixtures/* | P0 |
| P2 | core/tokenizer.ts | P0 |
| P4 | core/parser.ts (incl. `walkStem`) | P0, P1, P2 (tests) |
| P5 | core/help.ts ('help' mode only) | P0, P1, P10 (tests) |
| P20 | core/man.ts (ManPage builder + text renderer + `man` module) | P0, P1, P10 (tests) |
| P6 | core/engine.ts | P0, P1, P10 |
| P8 | core/history.ts | P0 |
| P10 | modules/match/* | P0 |
| P11 | node/fileHistory.ts | P0, P8 (interface) |
| P3 | core/program.ts | P0, P2, P4 |
| P19 | core/complete.ts | P0, P2, P4 |
| P7 | core/handles.ts, core/scheduler.ts | P0, P3, P5, P20, P6 |
| P9 | core/app.ts, core/index.ts | P0, P3, P7, P8, P19, P20, P1 |
| P12 | node/shell.ts, node/index.ts (+completer, man text) | P9, P11 |
| P13 | browser/* except ghost | P9 |
| P21 | browser/ghost.ts | P13, P19 |
| P14 | react/index.ts | P13 |
| P15 | examples/* | P10, P12, P13, P21, P14 |
| P17 | integration tests | P15, P16 (built dist) |
| P18 | README rewrite | P17 |

The table above is the TRUE dependency graph — used for verification ordering and to
tell each agent what it may import. Execution is two-phase and maximally parallel:

```
Phase 0  (mechanical, orchestrator itself — no agent):
         write P0 verbatim from this plan; write P16 configs; commit.
Phase 1  (ALL implementation packets in parallel — 18 agents):
         P1 P2 P3 P4 P5 P6 P7 P8 P9 P10 P11 P12 P13 P14 P15 P19 P20 P21
         Every agent authors its files against the pinned signatures AND writes its
         test file. It runs its own tests; if a dependency isn't on disk yet, it
         reports "authored, tests pending" instead of failing.
Phase 2  (verification, dependency order — cheap, no authoring):
         run test suites leaf-first per the dependency table:
         [P2 P4 P5 P20 P6 P8 P10 P11 P1] → [P3 P19] → [P7] → [P9] → [P12 P13 P21]
         The FIRST suite to fail localizes the bug to that packet; dispatch one fix
         agent per failing packet (its own section + the failure output), re-run from
         that point. Iterate until green.
Phase 3  (integration): npm run build → P15 examples smoke → P17 integration tests
         (transcript pinning) → P18 README. P18 may be DRAFTED during Phase 1 with a
         transcript placeholder; only the pinning is serial.
```

Why this is safe at maximum width: no packet needs another packet's *code* to be
authored — only to prove green — because every export signature, file path, and test
expectation is fixed in this document. Interface drift is caught by Phase 2's ordered
verification, which attributes each failure to exactly one packet (everything beneath
it already passed). Critical path shrinks from ~7 serial agent-steps to 3 phases.
Each Phase-1 agent receives: §P0 verbatim, the grammar/scheduler/completion/manual
rule sections, and its own packet section — nothing else.

## P0 — shared contracts (complete contents)

### `src/core/types.ts` (write exactly this, plus doc comments)

```ts
// ---------- scalar / token layer ----------
export type Scalar = string | number | boolean

export type Token =
  | { kind: 'word'; text: string; quoted: boolean }
  | { kind: 'ref'; name: string }

export interface RefPlaceholder { kind: 'ref'; name: string }
export const isRef = (v: unknown): v is RefPlaceholder =>
  typeof v === 'object' && v !== null &&
  (v as RefPlaceholder).kind === 'ref' && typeof (v as RefPlaceholder).name === 'string'

// ---------- parsed args ----------
export interface Args {
  commands: string[]              // path segments as typed, e.g. ['match','scalar']
  modulePath: string[]            // module-tree path; '$' where a wildcard matched
  wildcards: string[]             // literal tokens consumed by '$' segments, in order
  positional: unknown[]           // coerced scalars; RefPlaceholder pre-injection
  options: Record<string, unknown> // canonical option names ONLY (never alias)
  raw: string                     // this line minus any trailing `as <name>`, trimmed
}

// ---------- modules ----------
export interface OptionSpec {
  alias?: string
  array?: boolean
  type?: 'string' | 'number' | 'boolean'
  describe?: string               // one-line doc; powers man + completion detail
  choices?: Scalar[]              // static value completions + man docs
}

export interface ModuleHelp {
  description: string
  options?: Record<string, string>
  examples?: Record<string, string>
}

export type ModuleFn<R = unknown> = (ctx: Invocation) => R | Promise<R>

export interface Module<R = unknown> {
  fn?: ModuleFn<R>
  options?: Record<string, OptionSpec>
  submodules?: Modules
  help?: ModuleHelp
  /** dynamic value completion for this module's argument position */
  complete?: (prefix: string, args: Args) => string[] | Promise<string[]>
}
export type Modules = Record<string, Module>

export interface Invocation {
  args: Args
  /** RESOLVED results of every deeper fn-bearing module, keyed by space-joined path */
  children: Record<string, unknown>
  path: string[]                  // this module's own path segments
  depth: number                   // 0 = childmost, increasing toward the root
  app: AppHandle
}

// ---------- program ----------
export type TaskSpec =
  | { kind: 'task'; lineIndex: number; raw: string; tokens: Token[]
      handle: string | null; deps: string[] }
  | { kind: 'invalid'; lineIndex: number; raw: string; error: Error }

export interface ParsedLine {
  chain: Module[]                 // matched modules root-first
  pathKeys: string[]              // cumulative keys, e.g. ['match','match scalar']
  help: 'help' | 'man' | null
  args: Args
}

export interface ParsedTask {
  spec: TaskSpec
  parsed: ParsedLine | null       // null when invalid
  error: Error | null             // parse-stage error, if any
}

export interface Program { input: string; tasks: ParsedTask[] }

// ---------- reports ----------
export interface TaskReport {
  lineIndex: number
  total: number                   // task count of the owning Program
  raw: string                     // original trimmed line incl. `as name`
  handle: string | null
  internal: boolean
  args: Args | null               // fully injected; null if parse failed
  status: 'ok' | 'error'
  result: Record<string, unknown> | null   // composite result / HelpOutput / {man|key: ManPage}
  error: Error | null
}

export interface RunReport { input: string; tasks: TaskReport[]; ok: boolean }

// ---------- handlers / effects ----------
export type DataHandler = (report: TaskReport, app: AppHandle) => void | Promise<void>
export interface UserEffect {
  matcher?: (args: Args) => boolean   // absent = always fires (even args:null tasks)
  fn: DataHandler
}
export type KeyEffect = (ev: KeyboardEvent, app: AppHandle) => void | Promise<void>

// ---------- history ----------
export interface HistoryStore {
  load(appId: string): Promise<string[]>
  append(appId: string, entry: string): Promise<void>
  clear(appId: string): Promise<number>
}
export interface HistorySession {
  readonly entries: readonly string[]
  record(entry: string): Promise<boolean>  // false = ignored/deduped/empty
  prev(): string | null
  next(): string | null                    // '' stepping just past end; null beyond
  reset(): void
  clear(): Promise<number>
}

// ---------- help (quick --help) ----------
export interface HelpNode {
  description: string
  options?: Record<string, string>
  examples?: Record<string, string>
}
export type HelpOutput = Record<string, HelpNode>

// ---------- manual ----------
export interface ManOption {
  name: string; alias?: string
  type: 'string' | 'number' | 'boolean' | 'untyped'
  array: boolean; describe?: string; choices?: Scalar[]
}
export interface ManExample { cmd: string; note: string }
export interface ManPage {
  kind: 'peprn:man'               // discriminant for platform renderers
  path: string[]                  // [] for the index page
  title: string
  description: string
  synopsis: string
  options: ManOption[]
  examples: ManExample[]
  subcommands: { name: string; description: string }[]
}
export const isManPage = (v: unknown): v is ManPage =>
  typeof v === 'object' && v !== null && (v as ManPage).kind === 'peprn:man'

// ---------- completion ----------
export type CompletionKind = 'command' | 'option' | 'value' | 'handle' | 'history'
export interface CompletionItem {
  value: string                   // full replacement text for the range
  kind: CompletionKind
  detail?: string
  replaceFrom: number             // offset in input where replacement starts
  replaceTo: number               // offset where it ends (the cursor)
}
export interface CompletionResult { items: CompletionItem[]; prefix: string }
export interface CompletionSources {
  modules: Modules
  handles?: string[]
  history?: readonly string[]
}

// ---------- app ----------
export interface RunOptions { internal?: boolean }

export interface AppOptions {
  id: string
  modules?: Modules
  dataHandler?: DataHandler
  userEffects?: UserEffect[]
  catch?: (error: Error, report: TaskReport, app: AppHandle) => void
  init?: (app: AppHandle) => void | Promise<void>
  preprocessInput?: (input: string, app: AppHandle) => string | null
  history?: HistoryStore | null   // null = disabled; undefined = platform default
  historyIgnore?: string[]        // prefix list; default ['history']
  completion?: boolean            // default true; false = platforms don't wire Tab/ghost
}

export interface AppHandle {
  readonly id: string
  readonly modules: Modules
  readonly handles: HandleRegistryLike
  readonly history: HistorySession | null
  readonly disposed: boolean
  run(text: string, opts?: RunOptions): Promise<RunReport>
  complete(input: string, cursor?: number): Promise<CompletionResult> // cursor default input.length
  dispose(): void
}

export interface HandleRegistryLike {
  register(name: string, value: Promise<unknown>): void
  lookup(name: string): Promise<unknown> | undefined
  has(name: string): boolean
  names(): string[]
  clear(): void
}
```

### `src/core/errors.ts`

```ts
export class PeprnError extends Error {
  readonly code: string
  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options); this.name = new.target.name; this.code = code
  }
}
export class ParseError extends PeprnError {            // 'PARSE'
  constructor(message: string, cause?: unknown) { super('PARSE', message, { cause }) } }
export class UnknownCommandError extends PeprnError {   // 'UNKNOWN_COMMAND'
  constructor(cmd: string) { super('UNKNOWN_COMMAND', `Unknown command "${cmd}"`) } }
export class UnknownHandleError extends PeprnError {    // 'UNKNOWN_HANDLE'
  constructor(name: string) { super('UNKNOWN_HANDLE', `Unknown handle "@${name}"`) } }
export class DependencyFailedError extends PeprnError { // 'DEP_FAILED'
  constructor(name: string, cause: Error) {
    super('DEP_FAILED', `Dependency "@${name}" failed: ${cause.message}`, { cause }) } }
export class InjectionError extends PeprnError {        // 'BAD_INJECTION'
  constructor(name: string, detail: string) {
    super('BAD_INJECTION', `Cannot inject @${name}: ${detail}`) } }
export class DisposedError extends PeprnError {         // 'DISPOSED'
  constructor(id: string) { super('DISPOSED', `App "${id}" is disposed`) } }
```

P0 tests (`test/errors.test.ts`): each class `instanceof PeprnError`, correct `.code`;
`new UnknownHandleError('x')` message exactly `Unknown handle "@x"`;
`DependencyFailedError('b', new Error('boom!'))` message `Dependency "@b" failed: boom!`
with `.cause` the original.

## Grammar (tokenizer + line syntax)

No comment syntax. One statement per line; newline is the only separator.

```
program   := line (NEWLINE line)*
NEWLINE   := '\n'                ; preceding '\r' stripped
line      := WS* (task WS*)?     ; whitespace-only lines produce no task
task      := token (WS+ token)* asSuffix?
asSuffix  := WS+ 'as' WS+ NAME   ; only as the final two tokens; 'as' unquoted bare
token     := ref | quoted | bare
ref       := '@' NAME            ; only when '@' is the FIRST char of a token
NAME      := [A-Za-z_][A-Za-z0-9_]*
quoted    := '"' qchar* '"' | "'" qchar* "'"
                                 ; a quote OPENS a token only at a token boundary;
                                 ; elsewhere it is a literal character
qchar     := escape | any char except closing quote, '\', NEWLINE
bare      := (escape | any char except WS, NEWLINE)+
escape    := '\' anychar         ; yields anychar literally, inside AND outside quotes
WS        := ' ' | '\t'
```

- G1. Strip `\r`; skip whitespace-only lines (no task; `lineIndex` still counts them).
- G2. Token beginning `@` must continue with valid `NAME`, else `ParseError`
  `Invalid @reference "<token>"`. `@` mid-word (`user@host`) is literal; `\@x` is bare `@x`.
- G3. Unterminated quote → `ParseError` `Unterminated quote`. Quotes never span lines.
- G4. Trailing lone `\` → `ParseError` `Dangling escape` (the node shell strips
  continuation backslashes BEFORE tokenizing; see P12).
- G5. Quoted tokens are inert: never a ref, never `as`, never a flag, never a command
  name, never number-coerced (unless an option's explicit `type` coerces).
- G6. `as` suffix: final two tokens bare unquoted `as` + token matching `NAME` → removed;
  last becomes handle. Bare final `as` + non-NAME → `ParseError`
  `Invalid handle name "<token>"`. Final bare `as` with nothing after: literal token.
  `as` elsewhere: literal. Line that is only `as name` → `ParseError`
  `Missing command before "as"`.
- G7. `deps` = unique ref names in order of first appearance in remaining tokens.

Parser-level word classification (P4): flag = unquoted matching `/^--?[A-Za-z]/`
(canonical name = text minus leading dashes, resolved through aliases; `-1`/`-3.5`
are numbers; `-`/`--` alone positional strings; `--name=value` NOT supported).
Number = unquoted `/^-?\d+(\.\d+)?$/` → `number`. Unquoted `--help`/`-h` anywhere →
help mode `'help'`; `--man` → `'man'` (man wins if both); consumed, never stored.

## Scheduler semantics (normative rules)

1. `app.run(text, { internal })` applies `preprocessInput` first (whole text). `null` →
   `RunReport { input: text, tasks: [], ok: true }`, nothing else happens.
2. Text builds into a `Program` ONCE: tokenize each line, extract `as` + deps, resolve
   module chain, parse options/positionals with `RefPlaceholder`s in place. A throwing
   line becomes a `ParsedTask` with `error` set; siblings unaffected.
3. Synchronous scheduling pass in line order; per task: (a) capture dep promises from
   the registry AT THIS MOMENT, (b) create the task promise, (c) register its handle if
   any. Consequences: forward references fail (`UnknownHandleError`); `pass @a as a`
   reads the previous `a`; cycles impossible.
4. Handle value = resolved result of the DEEPEST fn-bearing module in the chain
   (`undefined` for purely syntactic chains). Registry stores the promise immediately
   and internally attaches a no-op `.catch` (no unhandled rejections).
5. Handle overwrite: silent replace; tasks holding the old promise unaffected. Handles
   persist across `run()` calls; `dispose()` clears.
6. Tasks WITHOUT a handle are "sequential": each awaits SETTLEMENT (not success) of the
   previous sequential task, plus own deps. Tasks WITH a handle await only their deps.
   Invalid tasks count as immediately-settled sequential members. Chain is per-program.
7. Dep resolution: captured lookup `undefined` → immediate `UnknownHandleError` (first
   missing in `deps` order). Rejected dep → `DependencyFailedError(name, cause)` (first
   rejected in `deps` order). Siblings unaffected; the failed task's own handle is a
   rejected promise carrying that error.
8. Injection (`injectArgs`, pure): non-array option slot that IS a placeholder → assign
   resolved value as-is (any type). Inside array-option lists / positionals: resolved
   scalar → inserted at index; resolved array → elements spliced at index; anything
   else → `InjectionError` detail `non-scalar value in a list position; use a
   single-value option slot`. Values injected by reference, never re-stringified.
9. Help/man short-circuit: mode `'help'` → `getHelp(...)` is the result; mode `'man'` →
   `{ [args.commands.join(' ') || 'man']: buildManPage(modules, args.commands) }` (index
   page when commands empty). Otherwise `executeChain` runs fns childmost → root in a
   plain sequential loop with RESOLVED `children`; a throw fails the task (ancestors
   don't run). Empty chain → `UnknownCommandError(firstToken)`.
10. allSettled semantics: exactly one `TaskReport` per task; failures never erase
    sibling results. `catch`, when present, is called once per failed task (after
    dataHandler + effects) and does NOT convert the task to success.
11. Per-task settlement pipeline, awaited in order: `dataHandler(report, app)` →
    `Promise.all` of matching `userEffects` (matcher absent = always; matcher present
    and `args === null` = skipped) → `catch` if failed. `run()` resolves after all
    pipelines settle; tasks in line order.
12. History: raw submitted text (trimmed) recorded via `history.record()` BEFORE
    execution; skipped when `internal: true` or a `historyIgnore` prefix matches.
13. `internal` flows into every `TaskReport.internal`; default platform handlers print
    nothing for internal reports.
14. `dispose()`: clears registry, marks disposed (`run()` then rejects `DisposedError`),
    platform layers unbind DOM/readline/ghost and remove injected UI. Idempotent.

## Completion semantics (core engine, rules C1–C10)

`complete(sources, input, cursor)`:

- C1. Only the line containing `cursor` matters; active text = lineStart..cursor.
- C2. Lenient token scan of active text; unterminated quote at cursor → empty result.
  `current` = token ending exactly at cursor; if active text ends in WS, `current` is an
  empty fresh token at cursor. `prefix` = current token text.
- C3. If the token before `current` is a bare unquoted `as` (not line-initial) → empty
  result (handle names are user-invented).
- C4. `current` starts with `@` → handle items: registry names prefix-matched on the
  text after `@`; `value` = `'@' + name`, kind `'handle'`.
- C5. Else `current` starts with `-` and is not numeric → option items: accumulate
  specs via `walkStem` over prior tokens; candidates per spec: dash rule = name of
  length 1 gets `-x`, longer gets `--xx`, for BOTH canonical and alias; prefix-filter;
  kind `'option'`; `detail` = `[type ?? 'untyped'] + (array ? '[]' : '') +
  (describe ? ' ' + describe : '')`; dedupe.
- C6. Else if the previous token is a flag whose resolved spec has `choices` → value
  items from `String(choice)` prefix-filtered, kind `'value'`.
- C7. Else if all prior tokens extend the stem walk (stem not yet ended) → command
  items from the current submodule level's keys (excluding `'$'`), prefix-filtered;
  `detail` = that submodule's `help.description`.
- C8. Additionally, when `current` is neither flag nor handle and a deepest module with
  `complete` is matched: call `complete(prefix, argsSoFar)` (argsSoFar = best-effort
  `parseLine` of prior tokens; on throw, an empty Args). Merge as kind `'value'`.
  Errors from user `complete()` are swallowed (contribute nothing).
- C9. History items (only if `sources.history` given): whole input is a single line,
  cursor at end, line non-empty → entries prefix-matching the whole line, most recent
  first, max 5; kind `'history'`, `replaceFrom: 0`, `value` = entire entry.
- C10. Order: context items (C4–C8) alphabetical by `value`, then history items; dedupe
  by `(value, replaceFrom)`. All non-history items use `replaceFrom` = current token
  start, `replaceTo` = cursor.

## Manual semantics

`buildManPage(modules, path)` (throws `UnknownCommandError` on a bad segment) /
`buildManIndex(modules, title)`:

- `title` = `path.join(' ')` (index: the title arg, the app id).
- `description` = `help.description ?? '(no description)'`.
- `synopsis` = title + per own option (canonical alphabetical): boolean → ` [--name]`
  (dash rule as completion), array → ` [--name value ...]`, else ` [--name value]`;
  + ` <subcommand>` when submodules exist. Index synopsis: `title + ' <command>'`.
- `options` = the module's OWN options only (inherited appear on ancestor pages):
  `{ name, alias, type: spec.type ?? 'untyped', array: !!spec.array,
  describe: spec.describe ?? help.options?.[name], choices }`.
- `examples` from `help.examples` → `{ cmd: title + ' ' + key, note: value }`.
- `subcommands` = submodule keys (`'$'` rendered `<name>`) + their descriptions.

`renderManText(page)` — deterministic layout, golden-fixture testable: sections NAME
(`title — description` with ` — ` separator), SYNOPSIS, OPTIONS (rows
`-l, --left` | type+`[]` | describe, columns padded to longest+2), EXAMPLES (cmd line,
note indented 4 under it), SUBCOMMANDS (name padded, description). Two-space section
indent; empty sections omitted; single blank line between sections; no trailing newline.

`makeManModule()` — root command `man`; `fn`: `path = ctx.args.positional.map(String)`;
empty → `buildManIndex(ctx.app.modules, ctx.app.id)`, else
`buildManPage(ctx.app.modules, path)`. Injected by `createApp` unless the user defines
`man`. The `--man` flag routes through scheduler rule 9 to the same builders.

Platform rendering: node `formatTaskReport` — if the composite result has exactly one
value and `isManPage(value)` → return `renderManText(page)`. Browser default handler —
`isManPage` → append `renderManHtml(page, app)` element instead of JSON text.

---

## Packets in detail

### P1 — test fixtures
`test/fixtures/modules.ts` exports (typed `Module`/`Modules`):
- `echo`: options `{ a:{alias:'alpha'}, list:{alias:'l',array:true}, n:{type:'number'},
  s:{type:'string'}, v:{alias:'verbose',type:'boolean'} }`; help
  `{ description:'echo parsed args', examples:{ '-a 1':'echoes -a' } }`;
  `fn: (ctx) => ({ options: ctx.args.options, positional: ctx.args.positional, wildcards: ctx.args.wildcards })`.
- `pass`: options `{ x:{} }`; `fn: (ctx) => ctx.args.options.x !== undefined ? ctx.args.options.x : ctx.args.positional[0]`.
- `list`: options `{ xs:{array:true} }`; `fn: (ctx) => ctx.args.options.xs ?? []`.
- `obj`: `fn: () => ({ k: 1 })`.
- `boom`: `fn: () => { throw new Error('boom!') }`.
- `wait`: `fn: async (ctx) => { const ms = Number(ctx.args.positional[0] ?? 0);
  await new Promise(r => setTimeout(r, ms)); return 'waited:' + ms }`.
- `syn`: no fn; `submodules: { leaf: { fn: () => 'leaf' } }`.
- `dyn`: no fn; `submodules: { '$': { options:{ d:{} }, fn: (ctx) => ctx.args.wildcards } }`.
- `pick`: options `{ color: { choices: ['red','green'], describe: 'a color' } }`;
  `fn: (ctx) => ctx.args.options.color ?? null`.
- `dynv`: `complete: (prefix) => ['alpha','beta'].filter(s => s.startsWith(prefix))`;
  `fn: (ctx) => ctx.args.positional[0] ?? null`.
- `fixtures: Modules` = all of the above by name.

`test/fixtures/helpers.ts`: `dummyApp(): AppHandle` (inert stub; `run`/`complete`
reject, registry no-op) and `makeTestApp(overrides?): Promise<{ app; reports:
TaskReport[] }>` = `createApp({ id:'t', modules: fixtures, history:
createMemoryHistory(), dataHandler: r => { reports.push(r) }, ...overrides })`.

### P2 — tokenizer
`src/core/tokenizer.ts`:
```ts
export function tokenizeLine(line: string, lineIndex: number): Token[]  // throws ParseError
```
Grammar G1–G5 (no `as`/dep handling — that's P3). Empty/WS line → `[]`.

Tests (`test/tokenizer.test.ts`; `w(t)`/`q(t)`/`r(n)` shorthands, exact deepEqual):
1. `match scalar -l 1 a -r 1 b` → `[w('match'),w('scalar'),w('-l'),w('1'),w('a'),w('-r'),w('1'),w('b')]`
2. `echo "hello world"` → `[w('echo'), q('hello world')]`
3. `echo "she said \"hi\""` → `[w('echo'), q('she said "hi"')]`
4. `echo it's` → `[w('echo'), w("it's")]`
5. `echo \@lit @ref` → `[w('echo'), w('@lit'), r('ref')]`
6. `echo user@host` → `[w('echo'), w('user@host')]`
7. `echo @` → ParseError `Invalid @reference "@"`
8. `echo @9x` → ParseError `Invalid @reference "@9x"`
9. `echo "unterminated` → ParseError `Unterminated quote`
10. `echo one\` (trailing backslash) → ParseError `Dangling escape`
11. `   ` → `[]`
12. `echo ''` → `[w('echo'), q('')]`
13. `echo -1.5 --flag` → `[w('echo'), w('-1.5'), w('--flag')]`

### P4 — parser
`src/core/parser.ts` (imports types/errors only):
```ts
export function walkStem(modules: Modules, tokens: Token[]): {
  chain: Module[]; pathKeys: string[]; specs: Record<string, OptionSpec>
  consumed: number                 // tokens consumed by the stem
  level: Modules                   // submodules available at the stopping point
}
export function parseLine(modules: Modules, tokens: Token[], raw: string): ParsedLine
// throws ParseError | UnknownCommandError
```
- Stem walk: unquoted non-ref word that is a key at the current level extends the stem;
  else a `'$'` key matches it (literal → `commands` + `wildcards`, `'$'` →
  `modulePath`). First non-match (or quoted/ref/flag token) ends the stem permanently.
  Empty chain → `UnknownCommandError(firstPrintableToken)`, EXCEPT a line that is only
  `--help`/`--man` (legal: empty chain + help mode). Option specs accumulate root→leaf;
  leaf wins collisions; canonical + alias both resolve to canonical; output canonical
  only. `walkStem` is the shared implementation (parser + completion both use it).
- `type:'boolean'` consumes no value → `true`. Non-array option: exactly ONE following
  value token; extras → positionals. Array option: values until next flag or EOL;
  repeated flags append. Repeated non-array: last wins. Trailing flag with no value:
  `true` (any type).
- Coercion: `'number'` → `Number(text)`, NaN → ParseError
  `Option --<name> expects a number, got "<text>"` (quoted included); `'string'` →
  keep; untyped → number-regex for unquoted, string for quoted; positionals same
  untyped rule. Ref tokens become `RefPlaceholder`s in whatever slot they occupy.
  Unknown flags accepted as untyped non-array options.
- Help detection per grammar; `args.raw = raw`.

Tests (`test/parser.test.ts`; `tok = s => tokenizeLine(s, 0)`; deepEqual on named fields):
1. `echo --alpha 5` → options `{a: 5}`, pathKeys `['echo']`
2. `echo -v 5` → options `{v: true}`, positional `[5]`
3. `echo -n "42"` → options `{n: 42}`
4. `echo -n abc` → ParseError `Option --n expects a number, got "abc"`
5. `echo -s 42` → options `{s: '42'}`
6. `echo -a -3 -1.5` → options `{a: -3}`, positional `[-1.5]`
7. `echo "1" 2` → positional `['1', 2]`
8. `echo --list 1 2 -a 9` → options `{list: [1,2], a: 9}`
9. `echo -l 1 -l 2` → options `{list: [1,2]}`
10. `echo -a 1 -a 2` → options `{a: 2}`
11. `echo -a 1 2` → options `{a: 1}`, positional `[2]`
12. `dyn foo -d 4` → commands `['dyn','foo']`, modulePath `['dyn','$']`, wildcards `['foo']`, options `{d: 4}`
13. `echo echo` → commands `['echo']`, positional `['echo']`
14. `echo --zz 1` → options `{zz: 1}`
15. `match scalar -l 1 a hellllllo world -r 1 b hellllllllllo world` → pathKeys
    `['match','match scalar']`, options `{l:[1,'a','hellllllo','world'], r:[1,'b','hellllllllllo','world']}`
16. `pass -x @a` → options `{x: {kind:'ref',name:'a'}}`
17. `list --xs 1 @a 2` → options `{xs: [1, {kind:'ref',name:'a'}, 2]}`
18. `syn @a leaf` → pathKeys `['syn']`, positional `[{kind:'ref',name:'a'}, 'leaf']`
19. `match scalar --help` → help `'help'`, options `{}`
20. `--man` → chain `[]`, help `'man'` (no throw)
21. `frobnicate 1` → UnknownCommandError `Unknown command "frobnicate"`
22. `walkStem(fixtures, tok('match scalar -l 1'))` → consumed 2, pathKeys
    `['match','match scalar']`, specs has keys `l` and `r`

### P3 — program builder
`src/core/program.ts` (imports tokenizer, parser):
```ts
export function extractHandle(tokens: Token[]): { tokens: Token[]; handle: string | null } // G6
export function collectDeps(tokens: Token[]): string[]                                     // G7
export function buildProgram(text: string, modules: Modules): Program
```
Split on `\n`; per non-empty line: tokenize → extractHandle → collectDeps → `parseLine`;
any throw captured into an invalid `ParsedTask` (siblings unaffected). `lineIndex` =
raw split index (blank lines counted, no task). `spec.raw` = trimmed original incl.
`as`; `args.raw` excludes it.

Tests (`test/program.test.ts`, fixtures):
1. `pass 1` → 1 task, handle null, deps `[]`, pathKeys `['pass']`
2. `pass 1 as a` → handle `'a'`, positional `[1]`, `args.raw 'pass 1'`, `spec.raw 'pass 1 as a'`
3. `pass "as"` → handle null, positional `['as']`
4. `pass as` → handle null, positional `['as']`
5. `pass save as db` → handle `'db'`, positional `['save']`
6. `pass 1 as 9bad` → invalid, message `Invalid handle name "9bad"`
7. `as a` → invalid, `Missing command before "as"`
8. `pass @a @b @a` → deps `['a','b']`
9. `pass 1\n\n  \npass 2` → 2 tasks, lineIndex 0 and 3
10. `frobnicate 9` → task present, `error instanceof UnknownCommandError`
11. `echo "unterminated\npass 1` → task0 invalid, task1 ok

### P5 — quick help
`src/core/help.ts`:
```ts
export function getHelp(modules: Modules, parsed: ParsedLine): HelpOutput  // 'help' mode only
```
Single entry keyed `parsed.args.commands.join(' ')` for the deepest matched module
(missing help → `{ description: 'no help defined' }`); empty stem → one
`{ description }` entry per root module. `examples` keys prefixed with entry key + space;
`options` copied verbatim.

Tests (`test/help.test.ts`, real match module):
1. `match --help` → `{ match: { description: 'test whether specified option values are equal', options: { 'l (left)': 'comparison value', 'r (right)': 'comparison value' } } }`
2. `match scalar --help` → `{ 'match scalar': { description: 'test whether the supplied scalar pairs are equal', examples: { 'match scalar -l 1 2 3 -r 1 2 4': <verbatim>, 'match scalar --left 1 2 3 --right 1 2 4': <verbatim> } } }`
3. `pass --help` (fixtures) → `{ pass: { description: 'no help defined' } }`
4. `--help` with `{match, pass}` → both root entries, descriptions as above

### P20 — manual core
`src/core/man.ts` (imports types/errors):
```ts
export function buildManPage(modules: Modules, path: string[]): ManPage
export function buildManIndex(modules: Modules, title: string): ManPage
export function renderManText(page: ManPage): string
export function makeManModule(): Module
```
Behavior per "Manual semantics" above.

Tests (`test/man.test.ts`, match + fixtures):
1. `buildManPage({match}, ['match','scalar'])` → `title 'match scalar'`, options
   deepEqual `[{name:'l',alias:'left',type:'untyped',array:true,describe:'comparison value',choices:undefined},{name:'r',alias:'right',...}]`
   (describe falls back to `match`'s `help.options`? No — scalar has no own help.options;
   describe undefined here [the fallback reads the SAME module's help.options only]),
   synopsis `'match scalar [--l value ...] [--r value ...]'`, examples length 2 with
   `cmd` starting `'match scalar '`, subcommands `[]`
2. `buildManPage({match}, ['match'])` → subcommands `[{name:'scalar',description:'test whether the supplied scalar pairs are equal'}]`, synopsis ends `' <subcommand>'`
3. `buildManPage(fixtures, ['dyn'])` → subcommands `[{name:'<name>',description:'(no description)'}]`
4. `buildManPage(fixtures, ['nope'])` → throws UnknownCommandError
5. `buildManIndex({match, pass:fixtures.pass}, 'cli')` → path `[]`, title `'cli'`,
   subcommands names `['match','pass']`, synopsis `'cli <command>'`
6. `renderManText` golden test: page from (1) → exact multi-line string (spelled out in
   the test, sections NAME/SYNOPSIS/OPTIONS/EXAMPLES, `-l, --left` row present)
7. `isManPage(buildManIndex(...))` → true; `isManPage({})` → false
8. `buildManPage(fixtures, ['pick'])` options[0] → `{name:'color',type:'untyped',array:false,describe:'a color',choices:['red','green']}`

### P6 — engine
`src/core/engine.ts`:
```ts
export async function executeChain(parsed: ParsedLine, args: Args, app: AppHandle): Promise<Record<string, unknown>>
export function childmostKey(parsed: ParsedLine): string | null
```
Loop `i` from `chain.length-1` down to 0; skip fn-less modules (no result key);
`Invocation = { args, children: <results for deeper fn-bearing pathKeys>, path:
args.modulePath.slice(0, i+1), depth: chain.length-1-i, app }`;
`out[pathKeys[i]] = await fn(ctx)`; insertion order childmost-first; throws propagate.

Tests (`test/engine.test.ts`, `dummyApp()`):
1. README line → exact `{ 'match scalar': [ {index:0,match:true,left:1,right:1},
   {index:1,match:false,left:'a',right:'b'}, {index:2,match:false,left:'hellllllo',
   right:'hellllllllllo'}, {index:3,match:true,left:'world',right:'world'} ], match: 4 }`
   AND `Object.keys` deepEqual `['match scalar','match']`
2. `match` alone → `{ match: 0 }`
3. `syn leaf` → `{ 'syn leaf': 'leaf' }`; `childmostKey` → `'syn leaf'`
4. `boom` → rejects `boom!`
5. inline two-level module: parent asserts `Array.isArray(ctx.children['p c'])`
6. depth/path recording: child `depth 0`; parent `depth 1, path ['p']`
7. `childmostKey` of an all-fn-less chain → `null`

### P8 — history core
`src/core/history.ts`:
```ts
export function createMemoryHistory(): HistoryStore
export async function createHistorySession(store: HistoryStore, appId: string, ignore?: string[]): Promise<HistorySession>
export function makeHistoryModule(): Module
```
`record` trims trailing `[\n\s]+`, skips empty / ignore-prefixed / equal-to-last, then
push + `store.append` + `reset`. Default ignore `['history']`. Module: `history` →
`ctx.app.history?.entries.slice() ?? []`; `history delete` →
`{ deleted: await clear() }` (`{ deleted: 0 }` when no session).

Tests (`test/history.test.ts`): dedupe-adjacent; ignore `'history delete'`; blank →
false; `'pass 2\n'` stored `'pass 2'`; cursor over `[a,b]`: `prev b, prev a, prev null,
next b, next '', next null`; `clear` → 2 then `[]`; two appIds isolated; new session
same store reloads entries.

### P10 — match modules
`src/modules/match/scalar.ts` + `index.ts` (types only). `scalar`: help/options
verbatim from 0.4.x (`l/left`, `r/right`, both `array: true`; add
`describe: 'comparison value'` on each); missing `l` or `r` → throw
`match scalar requires -l/--left and -r/--right`; rows `i` in
`0..max(l.length,r.length)-1`: `{ index: i, match: l[i] === r[i], left: l[i], right: r[i] }`.
`match`: help verbatim; `fn: (ctx) => Object.values(ctx.children).flat().length`;
`submodules: { scalar }`. Default export `match`; named export `scalar`.

Tests (`test/match.test.ts`, hand-built Invocations): pairwise rows exact; ragged
lengths → longer wins with `undefined` sides; missing `r` throws exact message;
`children {'match scalar':[1,2,3,4]}` → 4, `{}` → 0; same object identity → match true.

### P11 — node file history
`src/node/fileHistory.ts` (node:fs/promises, node:path, node:os):
```ts
export function createFileHistory(filePath?: string): HistoryStore
```
Path: arg → `process.env.PEPRN_HISTORY_FILE` → `~/.peprn/history.json`. File shape
`{ [appId]: string[] }`; missing/corrupt → `{}` (load never throws). `append`
mkdir-recursive read-modify-write. `clear` removes key, returns removed length.

Tests: temp file; append→load `['a','b']`; appId isolation; clear returns 2; missing
path → `[]`; corrupt file → `[]`.

### P19 — completion engine
`src/core/complete.ts` (imports tokenizer, parser):
```ts
export async function complete(sources: CompletionSources, input: string, cursor: number): Promise<CompletionResult>
```
Rules C1–C10.

Tests (`test/complete.test.ts`, fixtures + match; assert full items where short):
1. `('mat', 3)` → items `[{value:'match',kind:'command',replaceFrom:0,replaceTo:3,detail:'test whether specified option values are equal'}]`, prefix `'mat'`
2. `('match ', 6)` → command items `['scalar']`
3. `('match scalar --l', 16)` → `[{value:'--left',kind:'option',...}]`
4. `('match scalar -', 14)` → values `['--left','--right','-l','-r']` (alphabetical)
5. handles `['users','u2']`: `('pass -x @u', 10)` → values `['@u2','@users']`
6. `('pick --color g', 14)` → `[{value:'green',kind:'value',...}]`
7. `('dynv al', 7)` → `[{value:'alpha',kind:'value',...}]`
8. history `['match scalar -l 1 -r 1']`: `('match sc', 8)` → contains command item
   `scalar` AND history item `{value:'match scalar -l 1 -r 1',kind:'history',replaceFrom:0}`
9. `('echo "unterm', 12)` → items `[]`
10. `('pass 1 as ', 10)` → items `[]`
11. `('frobnicate x', 12)` → items `[]`
12. `('match scalar -l 1 ', 18)` → items `[]`

### P7 — handles + scheduler
`src/core/handles.ts`, `src/core/scheduler.ts` (imports engine, help, man, program types):
```ts
export class HandleRegistry implements HandleRegistryLike { /* register() defuses rejections */ }

export function injectArgs(args: Args, resolved: Map<string, unknown>): Args  // rule 8; throws InjectionError
export interface SchedulerContext {
  app: AppHandle; registry: HandleRegistry; internal: boolean
  onReport: (report: TaskReport) => Promise<void>
}
export function runProgram(program: Program, ctx: SchedulerContext): Promise<RunReport> // never rejects
```
Scheduler rules 3–10, 13 verbatim.

Tests (`test/scheduler.test.ts`; `run(text)` harness with persistent registry):
1. injectArgs `{x: ref('a')}` + `a→{k:1}` → `{x:{k:1}}` (strictEqual same reference)
2. injectArgs `{xs:[0, ref('a'), 9]}` + `a→[1,2]` → `{xs:[0,1,2,9]}`
3. injectArgs `{xs:[ref('a')]}` + `a→{k:1}` → InjectionError code `BAD_INJECTION`
4. injectArgs positional `[ref('a')]` + `a→5` → `[5]`; + `a→null` → throws
5. `pass 1` → ok, result `{pass: 1}`, total 1, handle null
6. `pass 1 as a\npass @a` → both ok; task1 `{pass: 1}`; `registry.has('a')`
7. `list --xs 1 2 as xs\nlist --xs 0 @xs 9` → task1 `{ list: [0,1,2,9] }`
8. `obj as o\npass -x @o` → task1 `{ pass: {k:1} }`
9. `obj as o\nlist --xs @o` → task1 error `BAD_INJECTION`; task0 ok
10. `boom as b\npass @b\npass 3` → task0 `boom!`; task1 `DEP_FAILED`
    `Dependency "@b" failed: boom!`; task2 ok `{pass: 3}`; `ok false`
11. `pass @nope` → `UNKNOWN_HANDLE` `Unknown handle "@nope"`
12. `pass @a as a` fresh registry → `UNKNOWN_HANDLE` (no self/forward reference)
13. `pass 1 as a\npass @a as b\npass 2 as a\npass @a` → task1 `{pass:1}`, task3 `{pass:2}`
14. `pass 7 as seven` then separate `run('pass @seven')` same registry → `{pass: 7}`
15. `wait 40 as slow\npass 2` → onReport order: `pass` report first
    (`reports[0].lineIndex === 1`); RunReport tasks still in line order
16. `boom\npass 5` → task0 error, task1 ok (sequential continues after failure)
17. `''` and `'  \n\n'` → `{ tasks: [], ok: true }`
18. `pass --help` → ok, result `{ pass: { description: 'no help defined' } }`
19. handle value childmost: `{p:{fn:()=>'parent',submodules:{c:{fn:()=>'child'}}}}`,
    `p c as h` → `registry.lookup('h')` resolves `'child'`
20. `match --man` (modules `{match}`) → ok, result key `'match'`, `isManPage(result.match)` true

### P9 — core app + index
`src/core/app.ts`, `src/core/index.ts`:
```ts
export async function createApp(options: AppOptions): Promise<AppHandle>
```
Modules = `options.modules ?? {}` + `history: makeHistoryModule()` (when a store is
configured and user didn't define `history`) + `man: makeManModule()` (unless user
defined `man`). History session from `options.history` (undefined → none in core).
`run` wires rules 1, 2, 11, 12, 14; onReport = dataHandler → effects → catch.
`app.complete(input, cursor = input.length)` = core `complete({ modules,
handles: registry.names(), history: session?.entries }, input, cursor)`.
`init(app)` awaited before `createApp` resolves. `core/index.ts` re-exports: all of
types + errors; `createApp`, `buildProgram`, `tokenizeLine`, `parseLine`, `walkStem`,
`injectArgs`, `runProgram`, `HandleRegistry`, `getHelp`, `executeChain`, `complete`,
`buildManPage`, `buildManIndex`, `renderManText`, `makeManModule`,
`createMemoryHistory`, `createHistorySession`, `makeHistoryModule`.

Tests (`test/app.test.ts`, `makeTestApp`):
1. `pass 1` → dataHandler once; report `{ lineIndex:0, total:1, handle:null,
   internal:false, status:'ok', result:{pass:1} }`
2. two-line program → two reports, both `total 2`
3. `run('pass 9', {internal:true})` → `internal true`; history empty
4. `run('boom')` → history contains `'boom'` (recorded before execution)
5. `historyIgnore: ['pass']` → `pass 1` not recorded
6. `history` command: contains prior entry; `history delete` → `{ deleted: <n> }`, empty after
7. `catch` spy: called once `(error, report, app)`; report still `status 'error'`
8. userEffects: matcher on `commands[0]==='pass'` fires selectively; matcher-less fires
   always incl. invalid lines (`args null`)
9. `preprocessInput: () => null` → `{ tasks: [], ok: true }`, no dataHandler call
10. dispose: idempotent; `run` rejects DisposedError; `handles.names()` `[]`
11. `init` received the handle (`app.id === 't'`)
12. `app.complete('pas')` → contains command item `pass`
13. `man` injected: `run('man')` → ok, result `{ man: <ManPage> }`, `isManPage` true,
    `title 't'`; `run('man match scalar')` with match module → page title `'match scalar'`

### P12 — node shell + entry
`src/node/shell.ts`, `src/node/index.ts` (node:readline, node:util, core, fileHistory):
```ts
export function formatTaskReport(report: TaskReport): string
export function makeCompleter(app: AppHandle): (line: string, cb: (err: null, result: [string[], string]) => void) => void
export function startShell(app: AppHandle, opts: { prompt?: string; input?: NodeJS.ReadableStream; output?: NodeJS.WritableStream; completion?: boolean }): { close(): void }

export interface NodeAppOptions extends AppOptions {
  prompt?: string; input?: NodeJS.ReadableStream; output?: NodeJS.WritableStream
  historyPath?: string | null   // null = no history; undefined = default file
}
export interface NodeApp extends AppHandle { close(): void }
export async function createNodeApp(options: NodeAppOptions): Promise<NodeApp>
export { createApp, createFileHistory }  // plus export * from '../core/index.js'
```
- `formatTaskReport`: internal → `''`. If composite result has exactly one value and
  `isManPage(v)` → `renderManText(v)`. Else label =
  `total > 1 ? (handle ? '['+handle+'] ' : '[line '+(lineIndex+1)+'] ') : ''`;
  body = ok ? `inspect(result, { depth: null, colors: false, compact: 3,
  breakLength: 72 })` : `'Error: ' + error.message`; return label + body.
- `makeCompleter`: treat received string `s` as cursor-at-end; await
  `app.complete(s, s.length)`; drop kind `'history'` items; result
  `[items.map(i => i.value), s.slice(items[0]?.replaceFrom ?? s.length)]`
  (empty items → `[[], '']`).
- `createNodeApp`: history per `historyPath` rule (default `createFileHistory()`);
  default dataHandler writes `formatTaskReport(r) + '\n'` to output (skip
  internal/empty); core `createApp` then `startShell` (completer wired unless
  `completion === false`); `close()` = shell close + dispose.
- Shell: `readline.createInterface({ input, output, prompt: opts.prompt ?? '> ',
  history: [...session.entries].reverse(), historySize: 200, completer })`; prompt
  immediately; on `'line'`: trailing single unescaped `\` → strip, buffer + `'\n'`,
  prompt `'... '`; else submit buffer+line, reset, `await app.run(text)`, re-prompt.
  `'close'` → `app.dispose()` (no `process.exit`). Runtimes without completer support
  (if any) degrade gracefully — shell still works.

Tests (`test/nodeShell.test.ts`):
1. formatTaskReport ok single → `"{ pass: 1 }"`
2. total 2 + handle `'fives'` → starts `'[fives] '`
3. total 2, handle null, lineIndex 1 → starts `'[line 2] '`
4. error `boom!` → `'Error: boom!'`
5. internal → `''`
6. ManPage result → output starts with `'NAME'`
7. `makeCompleter(app)('match sc', cb)` (fixtures+match app) → cb `[['scalar'], 'sc']`
8. startShell over PassThrough pair: `'pass 1\n'` → output contains `'{ pass: 1 }'`
   and two `'> '` prompts; continuation `'list --xs 1 \\\n--xs 2\n'` → contains
   `'... '` and `'{ list: [ 1, 2 ] }'`

### P13 — browser (except ghost)
`src/browser/history.ts`, `defaultUi.ts`, `defaultModules.ts`, `dom.ts`, `man.ts`,
`index.ts`. Imports: core only. NEVER imports react.
```ts
export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
export function createLocalStorageHistory(storage?: StorageLike): HistoryStore // key `peprn:history:<appId>`

export function ensureDefaultUi(id: string): { input: HTMLTextAreaElement; output: HTMLElement; remove(): void }
// injects <textarea id="<id>" class="peprn-default"> and <div class="peprn-default-out"><pre id="<id>-out">
// plus <style id="peprn-default-style"> ONCE; only creates what is missing; CSS includes .peprn-ghost rules

export function makeDefaultModules(getOutput: (appId: string) => HTMLElement | undefined): Modules
// hideOutput: display='none' on OWN output, returns 'hidden'; showOutput: '', returns 'shown'

export function renderManHtml(page: ManPage, app: AppHandle): HTMLElement
// <div class="peprn-man"> with <h3> title, <p> description, <pre class="peprn-man-synopsis">,
// <table class="peprn-man-options"> rows [flags, type(+[]), describe], <dl> examples,
// subcommand list where each name is an <a href="#"> whose click handler calls
// app.run('man ' + [...page.path, name].join(' ')) and preventDefault()s

export function bindDom(app: AppHandle, input: HTMLTextAreaElement, output: HTMLElement, userKeyEffects: KeyEffect[]): () => void
export function defaultBrowserDataHandler(output: HTMLElement): DataHandler

export interface BrowserAppOptions extends AppOptions {
  useBrowserDefault?: boolean
  input?: HTMLTextAreaElement; output?: HTMLElement
  userKeyEffects?: KeyEffect[]
}
export interface BrowserApp extends AppHandle { input: HTMLTextAreaElement; output: HTMLElement }
export async function createBrowserApp(options: BrowserAppOptions): Promise<BrowserApp>
export { createLocalStorageHistory }  // plus export * from '../core/index.js'
```
- Element resolution: explicit option → `getElementById(id)` / `(id + '-out')` →
  injected default (unless `useBrowserDefault === false` → throw
  `peprn: no input element for app "<id>"`).
- `bindDom` on `keydown`: Enter w/o Shift → preventDefault, take value, clear,
  `void app.run(text)`; Shift+Enter default; Alt+ArrowUp → `prev() ?? keep`;
  Alt+ArrowDown → `next()` (`''` clears, null leaves); then userKeyEffects
  fire-and-forget. Returns unbind.
- `defaultBrowserDataHandler`: skip internal; `isManPage` value → append
  `renderManHtml`; else text = node label rule + `JSON.stringify(result, null, 2)`
  (error: `'Error: ' + message`); APPEND new `<div>`; scroll to bottom.
- `createBrowserApp`: history default `createLocalStorageHistory()` when `undefined`;
  modules + defaults (unless `useBrowserDefault === false` or names taken); dataHandler
  default; ghost attached via P21 unless `completion === false`; dispose = unbind +
  ghost detach + remove injected UI + core dispose.

Tests (`test/browserHistory.test.ts`, storage stub): round-trip, per-app isolation,
clear count + removeItem called, corrupt JSON → `[]`. DOM behavior covered by the
browser example smoke (no DOM-emulation dependency permitted).

### P21 — ghost-text overlay
`src/browser/ghost.ts` (imports core types + complete via app):
```ts
export function ghostRemainder(items: CompletionItem[], text: string, cursor: number): { item: CompletionItem; remainder: string } | null
export function attachGhost(app: AppHandle, input: HTMLTextAreaElement): () => void
```
- `ghostRemainder` (pure): only when `cursor === text.length`; first item where
  `replaceTo === cursor` and `text.slice(item.replaceFrom)` is a proper prefix of
  `item.value`; remainder = `item.value.slice(cursor - item.replaceFrom)`; else null.
- `attachGhost`: mirror `<pre class="peprn-ghost">` inserted before `input` in the same
  parent, absolutely positioned over it (copies font/padding/border-box metrics from
  computed style; repositioned on window resize), `pointer-events: none`; typed text
  rendered transparent, remainder in a `<span class="peprn-ghost-hint">` (dim). Layout
  guaranteed for the injected default UI; best-effort for custom elements (documented).
- Update on input/click/focus/keydown via rAF debounce: `items = await
  app.complete(value, selectionStart)`; state = `ghostRemainder(...)` + cycle index.
- Keys: Tab → always preventDefault; if ghost visible, accept (value =
  `value.slice(0, item.replaceFrom) + item.value`, caret to end). Shift+Tab → cycle to
  next matching item (recompute ghost). ArrowRight with caret at end + ghost → accept.
  Escape → hide until content changes. Enter → clear state. Detach fn removes mirror
  + listeners.
- Ghost only shown when the caret is at the very end of the content (multiline: last
  line). History-kind items participate naturally (replaceFrom 0, whole-line).

Tests (`test/ghost.test.ts`, pure fn only):
1. items `[{value:'match',replaceFrom:0,replaceTo:3,...}]`, `('mat', 3)` →
   remainder `'ch'`
2. history item `{value:'match scalar -l 1',replaceFrom:0,replaceTo:8}`,
   `('match sc', 8)` → remainder `'alar -l 1'`
3. cursor not at end → null; exact-equal value (no proper prefix) → null; empty items → null

### P14 — react
`src/react/index.ts` (imports react [peer] + browser; `createElement`, no JSX):
```ts
export interface UsePeprnOptions extends Omit<BrowserAppOptions, 'input' | 'output' | 'useBrowserDefault'> {}
export interface UsePeprnResult {
  inputRef: (el: HTMLTextAreaElement | null) => void
  outputRef: (el: HTMLElement | null) => void
  app: AppHandle | null
  run: (text: string, opts?: RunOptions) => Promise<RunReport>
}
export function usePeprn(options: UsePeprnOptions): UsePeprnResult
export interface PeprnProps { options: UsePeprnOptions; className?: string }
export function Peprn(props: PeprnProps): React.ReactElement
```
Ref callbacks store elements in state (no polling); `useEffect` keyed on both elements
creates `createBrowserApp({ ...options, input, output, useBrowserDefault: false })`,
cleanup disposes — StrictMode-safe. `run` before mount rejects
`peprn app is not mounted yet`. `Peprn` renders `div.peprn-react > textarea + pre`.
No unit tests (typecheck + generated example verify).

### P15 — examples
- `examples/node/index.mjs`:
  ```js
  import { createNodeApp } from '../../dist/node/index.js'
  import match from '../../dist/modules/match/index.js'
  createNodeApp({ id: 'cli', modules: { match } })
  ```
- `examples/browser/index.html`: loads `./bundle.js` type=module; body otherwise empty.
- `examples/browser/main.mjs`: `createBrowserApp({ id: 'cli', modules: { match } })`
  from `../../dist/browser/index.js` + `../../dist/modules/match/index.js`.
- `examples/react-generator/generate.mjs` (node:fs/path/readline/child_process):
  CLI `--dir <path>`, `--force`, `--dry-run`, `--no-install`.
  1. Resolve dir (prompt `Target directory: ` if absent).
  2. Non-empty dir without `--force` → stderr `Refusing to write into non-empty
     directory <dir>; pass --force to override.`, exit 1 (checked under `--dry-run` too).
  3. Actions (printed `DRY: <action>` under `--dry-run`): `npm pack
     --pack-destination <dir>` in repo root (LOCAL checkout); write package.json
     (react/react-dom ^18, `peprn: file:peprn-1.0.0.tgz`, devDep esbuild, scripts
     build/serve); write index.html; write main.js (`<Peprn/>` + match); write
     build.mjs (esbuild bundle); `npm install` (skip with `--no-install`).
  4. `Done. Next: cd <dir> && npm run build && npm run serve (port 8080)`.

### P16 — infra
- `tsconfig.json`: target ES2022, module NodeNext, moduleResolution NodeNext,
  lib ["ES2022","DOM"], strict, declaration, skipLibCheck.
- `tsconfig.build.json`: extends; include ["src"], outDir "dist", rootDir "src".
- `tsconfig.test.json`: extends; include ["src","test"], outDir "dist-test",
  rootDir ".", declaration false, sourceMap true.
- `scripts/build-examples.mjs`: esbuild API bundles `examples/browser/main.mjs` →
  `examples/browser/bundle.js`, format esm; MUST FAIL if output contains
  `from "react"` or `require("react")` (react-leak guard).
- `.gitignore` additions: `dist/`, `dist-test/`, `examples/browser/bundle.js`.

### P17 — integration tests
`test/integration/repl.test.ts`, `test/generator.test.ts` (node:test). Spawn
`node examples/node/index.mjs` (skip all if `dist/node/index.js` missing) with
`PEPRN_HISTORY_FILE=<tmpdir>/hist.json`; 0.4.x harness pattern (write after 300ms,
kill after 2.5s, collect stdout+stderr). Bun leg when `bun --version` succeeds, else
skip. Cases in Verification below.

### P18 — README rewrite
Install; node example; THE pinned transcript; async-handles section (`as`/`@` with the
`fives` example); completion section (Tab on server, ghost text in browser); `man`
section; browser example; react generator; test instructions. Transcript copied
verbatim from actual node output; must keep the exact shape
`{ 'match scalar': [ ...4 rows... ], match: 4 }`.

## Integration order + verification

1. `npm install` (devDeps only).
2. `npm run build` = `tsc -p tsconfig.build.json && node scripts/build-examples.mjs`.
   Gate: exit 0; `dist/{core,node,browser,react}/index.js` + `dist/modules/match/index.js`
   + `.d.ts` exist; `examples/browser/bundle.js` exists, contains no react import.
3. Transcript pinning (once, P17/P18): run the node example, type
   `match scalar -l 1 a hellllllo world -r 1 b hellllllllllo world`, copy the printed
   block verbatim into the test as `EXPECTED_MATCH_BLOCK` and into README. Must contain
   `'match scalar': [`, all four rows, `match: 4`; keys childmost-first.
4. `npm test` = build + `tsc -p tsconfig.test.json && node --test dist-test/test/`.
   Integration cases:
   - node: output `includes(EXPECTED_MATCH_BLOCK)` byte-for-byte
   - bun: fragment assertions (`hellllllllllo`, `/match:\s*4/`)
   - `match --man` → contains `NAME` and `match scalar` and the scalar description
   - `man match scalar` → contains `SYNOPSIS` and `-l, --left`
   - blank line → no `Error`, prompt returns
   - `match scalar` → `Error: match scalar requires -l/--left and -r/--right`, prompt
     returns, process alive
   - `frobnicate` → `Error: Unknown command "frobnicate"`
   - `match scalar -l @nope -r 1` → `Error: Unknown handle "@nope"`
   - async transcript (continuation-joined program): `match scalar -l 5 -r 5 as fives \`
     + `match scalar -l @fives -r @fives` → output contains `[fives] ` and `[line 2] `,
     both with `match: 1`; line 2 rows `match: true` (identity preserved by value
     injection)
   - history persistence: session 1 `match scalar -l 1 -r 1`; session 2 `history` →
     contains it; `history delete` → `deleted: 1`
   - completer unit (in nodeShell tests): `makeCompleter` returns `[['scalar'],'sc']`
5. Browser smoke (manual or chrome-devtools): `npx http-server examples/browser -p 8080`;
   default UI appears; `match scalar -l 100 -r 101` + Enter → output shows the false row
   and `match: 1`; typing `mat` shows ghost `ch`, Tab completes to `match`; typing
   `match scalar -l 1 -r 1 as ones`, then a later `match scalar -l @on` ghost-completes
   `@ones`; `man match` renders an HTML page with an options table and a clickable
   `scalar` link; `hideOutput`/`showOutput` toggle the pane; Alt+ArrowUp recalls;
   reload → history survives (localStorage).
6. React generator: `--dry-run` prints the `DRY:` action list, exit 0; non-empty dir
   without `--force` → exit 1 `Refusing…`; full run then `npm run build && npm run
   serve` serves the react match example on 8080.
7. Bun parity: `bun examples/node/index.mjs` spot-check + automated bun leg.

## package.json (v1.0.0)

```json
{
  "name": "peprn",
  "version": "1.0.0",
  "description": "parse, evaluate, print, and repeat nested subcommands in node or the browser",
  "author": "rdroe",
  "license": "MIT",
  "repository": { "type": "git", "url": "https://github.com/rdroe/peprn.git" },
  "type": "module",
  "engines": { "node": ">=18.17" },
  "files": ["dist"],
  "sideEffects": false,
  "exports": {
    ".":         { "types": "./dist/core/index.d.ts",          "default": "./dist/core/index.js" },
    "./node":    { "types": "./dist/node/index.d.ts",          "default": "./dist/node/index.js" },
    "./browser": { "types": "./dist/browser/index.d.ts",       "default": "./dist/browser/index.js" },
    "./react":   { "types": "./dist/react/index.d.ts",         "default": "./dist/react/index.js" },
    "./match":   { "types": "./dist/modules/match/index.d.ts", "default": "./dist/modules/match/index.js" }
  },
  "peerDependencies": { "react": ">=18" },
  "peerDependenciesMeta": { "react": { "optional": true } },
  "scripts": {
    "build": "tsc -p tsconfig.build.json && node scripts/build-examples.mjs",
    "test": "npm run build && tsc -p tsconfig.test.json && node --test dist-test/test/",
    "serve": "http-server examples/browser -p 8080 -c-1"
  },
  "devDependencies": {
    "typescript": "~5.5.4",
    "@types/node": "^18.19.39",
    "@types/react": "^18.3.3",
    "esbuild": "^0.23.0",
    "http-server": "^14.1.1"
  }
}
```

No `dependencies` key at all; no `main`; no `typesVersions`; no eslint; no
install/prepare lifecycle scripts (so `npm|yarn|pnpm|bun install` of the published
package are equivalent); `engines` names node only.

## Verification of the finished v1 (end-to-end)

1. `npm install && npm run build` — exits 0; all five entry points emit `.js` + `.d.ts`;
   `examples/browser/bundle.js` built and react-free (the build script fails otherwise).
2. `npm test` — full `node --test` suite: every packet's units plus the subprocess
   REPL integration tests, run against **node and bun**, with the README transcript
   pinned byte-for-byte.
3. `bun examples/node/index.mjs` — manual parity spot-check of the readline shell,
   Tab completion, and `man`.
4. Browser: `npm run serve`, then drive Chrome to confirm ghost text completes `mat`→
   `match`, `@`-handles complete after `as`, `man match` renders linked HTML,
   `hideOutput`/`showOutput` toggle, Alt+↑ recalls, and history survives reload.
5. `node examples/react-generator/generate.mjs --dir <tmp> --dry-run` — exits 0 with the
   `DRY:` action list; the non-`--force` guard on a non-empty dir exits 1.
6. `git diff --stat main..v1` — confirms the old tree is gone and no 0.4.x file survives
   unintentionally.
