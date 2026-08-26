# peprn

**P**arse, **e**valuate, **p**rint, **r**epeat — **n**ested. A REPL for node, bun, and the
browser that runs CLI-style commands you define as a tree of modules.

Zero runtime dependencies. ESM only. Works identically on node ≥18 and bun.

```
npm install peprn
```

```js
import { createNodeApp } from 'peprn/node'

const greet = {
  help: { description: 'say hello' },
  options: { name: { alias: 'n', describe: 'who to greet' } },
  fn: (ctx) => `hello, ${ctx.args.options.name ?? 'world'}`
}

createNodeApp({ id: 'cli', modules: { greet } })
```

```
> greet -n ada
{ greet: 'hello, ada' }
```

---

## Command grammar

This is the language a user types at the prompt. It is **not** JavaScript, and no
TypeScript signature describes it — read this section before writing command strings.

```
  command sub1 sub2  positional "quoted words"  --opt val -a val  --flag  as name
  └── module path ─┘ └──── positionals ──────┘ └──── options ───┘ └────┘ └ handle ┘
```

| Form | Meaning |
|---|---|
| `cmd sub arg` | Walk the module tree as far as tokens match; the rest are arguments. |
| `--opt value` | Long option. Takes exactly one value unless declared `array`. |
| `-o value` | Short alias for a long option. |
| `--flag` | Options declared `boolean` never consume a value; a valueless option is `true`. |
| `--arr a b c` | An `array` option collects values until the next flag. Repeating it appends. |
| `"two words"` | Quotes group one token. Both `"` and `'` work. |
| `\x` | Backslash escapes the next character, inside and outside quotes. |
| `@name` | Await the handle `name` and splice its **resolved value** into that slot. |
| `cmd … as name` | Register the result under `name` **without blocking** the next line. |
| newline | Each line is a separate task. Lines run in order unless bound with `as`. |

Rules that surprise people, all pinned by tests:

- **`as` starts work, `@` waits for it.** A line without `as` runs to completion before
  the next begins. A line with `as` starts immediately and blocks nothing — only an
  explicit `@name` waits. A failed handle fails only the tasks that referenced it.
- **`@` is by reference.** The resolved value is spliced in as-is, never re-stringified,
  so object identity survives into your `fn`.
- **`@` is positional-sensitive.** In a single-value option slot any value is legal. In a
  list slot (positionals, array options) an array splices element-by-element, and a
  single non-scalar object throws `InjectionError`. **This is why every built-in returns
  an array.**
- **`@` must lead a token.** `user@example.com` is a literal; only a token *starting*
  with an unescaped `@` is a reference. Escape a leading one as `\@`.
- **Unquoted numbers coerce, quoted ones don't.** `1` is the number 1; `"1"` is a string.
  Negative numbers (`-5`) stay values, not flags.
- **Unknown flags are accepted**, untyped, rather than rejected.
- **`$` is a wildcard submodule name** — it matches any single token, collected into
  `ctx.args.wildcards`.
- `--help` / `-h` prints a one-level summary; `--man` renders the full page.

---

## Built-in commands

### Always present

`createApp` injects these unless you define your own module of the same name.

| Command | What it does |
|---|---|
| `man [command…]` | Full manual page derived from the live option specs — never stale. |
| `history` | List recorded command history. `history delete` clears it. |

The browser app also mounts `hideOutput` and `showOutput`, which toggle its output pane.

### `peprn/match` — value comparison

```js
import match from 'peprn/match'
```

| Command | Options | Returns |
|---|---|---|
| `match scalar` | `-l/--left` (array), `-r/--right` (array) | one row per index: `{ index, match, left, right }` |

```
> match scalar -l 1 a world -r 1 b world
{ 'match scalar': [ { index: 0, match: true,  left: 1, right: 1 },
                    { index: 1, match: false, left: 'a', right: 'b' },
                    { index: 2, match: true,  left: 'world', right: 'world' } ],
  match: 3 }
```

Ragged inputs yield `undefined` on the short side rather than truncating. Results are
keyed by module path, childmost first; the parent's own key is the flattened count of
what its children returned.

### `peprn/async` — timing

```js
import { asyncModules } from 'peprn/async'
```

| Command | Options | Returns |
|---|---|---|
| `sleep <ms>` | `--ms <n>` (or a bare positional) | `[{ slept }]` |

Not part of `peprn/dom` on purpose: a timer has nothing to do with a document, so this
works in a node shell too. Prefer `--waitfor` (below) over a fixed `sleep` — a fixed
pause is either longer than needed or too short to be reliable.

---

## `peprn/dom` — driving a real page

```js
import { domModules } from 'peprn/dom'          // 14 verbs, mount at top level
import dom from 'peprn/dom'                     // or namespaced: `dom find …`

createBrowserApp({ id: 'cli', modules: { ...domModules } })
```

Fourteen verbs that reach into the host page, **point at elements onscreen**, and drive
them. Roughly `@testing-library/dom` queries plus `@testing-library/user-event`
interactions, recast as a REPL vocabulary, with a fuzzy fallback Testing Library
deliberately lacks: a human at a prompt wants a best guess with a score, not a strict
-match error.

Browser-only — every verb throws `dom: requires a browser environment` in node. Mount
namespaced if you define your own `clear`, `on`, or `events`.

A session:

```
find email -k textbox as em     # point at it, save the row array as a handle
type @em "user@example.com"     # React-controlled inputs work
select country Iceland
check subscribe
on submit click as clicks       # start listening
click submit
events @clicks                  # drain what was observed
```

### Targeting: how every verb finds its element

Every verb except `off`/`events` resolves a target the same way, in this precedence:

1. `-t/--target <ref|row|text>` if given.
2. A spliced row object (`click @btn`).
3. A bare registry ref (`click el4`).
4. Otherwise the leading words run a quiet implicit `find`.

Whatever words are left after the target become the verb's own argument — which is why
`type @em hello` and `select country Iceland` both read naturally. Verbs that take no
trailing argument join *all* the words into the query, so `click Delete all records`
targets the full phrase rather than just `Delete`.

**Shared targeting options** (on all 12 targeting verbs):

| Option | Meaning |
|---|---|
| `-t/--target` | Explicit target: a ref, a spliced row, or query text. |
| `-k/--role` | Hard-filter by inferred role (see the role list under `find`). |
| `--near <text>` | Prefer matches physically closer onscreen to an anchor. |
| `-x/--exact` | Equality only, no fuzzy fallback. |
| `-n/--nth <N>` | Take the Nth-ranked match (1-based). |
| `-q/--quiet` | Skip the onscreen pointer flash. |
| `-w/--waitfor [ms]` | Retry until the target appears. Default timeout 5000ms. |

`--waitfor` is the answer to the most common failure in page automation — acting before
a re-render lands:

```
click "Load results"
click Apply --waitfor        # retries until the deferred button exists
```

On timeout you get the underlying failure, not a bare "timed out":
`dom: no match for "Apply" — closest: … (gave up after 5000ms)`.

### `find` — query and point

```
> find email -k textbox
[ { ref: 'el3', nth: 1, tag: 'input', role: 'textbox', name: 'Email',
    via: 'label', score: 1, x: 24, y: 96, w: 240, h: 28 } ]
```

Returns ranked rows and draws a numbered outline overlay. Options beyond the shared set:

| Option | Meaning |
|---|---|
| `--label --placeholder --text --testid --value --alt --title` | Score against one source only. |
| `--all` | Up to 25 rows instead of 5. |
| `--limit <N>` | Exact row cap. |
| `--clear` | Clear the overlay. Alone, just clears and returns `[]`. |

Roles for `-k/--role`: `button`, `link`, `textbox`, `checkbox`, `radio`, `combobox`,
`listbox`, `option`, `slider`, `heading`, `img`, `generic`.

**Scoring.** Each source is weighted — label 1.0, aria 0.98, text 0.95, placeholder 0.9,
value 0.85, title 0.8, alt 0.8, testid 0.75, proximate 0.6 — and each match tiered:
exact 1.0, prefix 0.9, word-prefix 0.85, substring 0.75, else a bigram-similarity score
above a 0.34 floor. Highest source × tier wins. Hidden elements are halved, disabled ×0.8.
Nothing under 0.3 counts, so `find sumbit` still finds "Submit order" but a real miss
throws with its three closest near-misses — whose refs are still registered, so you can
act on a guess anyway.

**Names the markup never declared.** Where a pairing is explicit — `<dt>`/`<dd>`, a
`<th>` or `headers` attribute naming cells beneath it — it counts as a `label` like any
other. Where nothing connects them, `find` falls back to the text *beside* the control,
reported as `via: "proximate"`: it walks up to three levels checking preceding siblings
and the parent's own text, and scans forward first for checkboxes and radios, whose
labels conventionally follow.

```
type coupon SAVE20        # <span>Coupon</span> <input>  — no for=, no <label>
type quantity 12          # <input> in a cell under <th>Quantity</th>
```

A proximate name is weighted below every stated source, so it only ever *adds* matches
that scored zero — it can never displace a name the page actually declared. The element
that supplied the text is demoted, so `find coupon` lands on the input rather than the
inert `<span>` captioning it. `via` always tells you whether `find` read or inferred.

### Act verbs

Each plays a full user-event-fidelity DOM sequence and returns
`[{ ref, did, value?, changed? }]`.

| Verb | Extra options | Notes |
|---|---|---|
| `click` | — | Full pointer/mouse sequence, then native activation. |
| `dblclick` | — | A click, then a second down/up/click at `detail:2`, then `dblclick`. |
| `type <target> <text>` | `--delay <ms>`, `--change true\|false` | Per-character keydown/keypress/beforeinput/input/keyup. |
| `clear` | — | `beforeinput` → empty → `input` → `change`. |
| `select <target> <option>` | `--value`, `--index <N>`, `--add` | Exact text → exact value → substring → fuzzy. |
| `check` / `uncheck` | — | No-op if already in the desired state. |
| `press [target] <key>` | `--repeat <N>` | `Control+Shift+a` syntax. |
| `hover` | — | Leave sequence on the last hover, then enter. |
| `focus` | — | `.focus()`, falling back to synthetic `focus`/`focusin`. |

`type` writes through the native prototype setter, which is what makes React-controlled
inputs register the change. A single positional means "type into whatever is focused",
so quote multi-word text: `type "hello world"`.

`press` uses real key names: `Enter`, `Escape`, `Tab`, `ArrowDown`, `F1`–`F12`, `+`, and
`Space` (dispatched as `key: ' '`, since that is what a real event carries).

### Listen verbs

```
> on submit click as clicks
[ { sub: 'sub1', ref: 'el9', events: [ 'click' ], count: 0, live: false } ]
> click @clicks
> events @clicks
[ { sub: 'sub1', ref: 'el9', seq: 1, type: 'click', ts: 1234, summary: 'button=0 @ 84,236' } ]
> off --all
```

| Verb | Options | Notes |
|---|---|---|
| `on <target> [event…]` | `-e/--event`, `--live`, `--once` | Default `click`. Never calls `preventDefault`. |
| `events [@sub…]` | `--all`, `--keep`, `--limit <N>` | Drains oldest-first; `--keep` peeks. |
| `off @sub… \| --all` | `--all` | Removes listeners and drops the subscription. |

Events for `-e`: `click`, `dblclick`, `input`, `change`, `keydown`, `keyup`, `submit`,
`focus`, `blur`, `pointerdown`, `pointerup`, `mouseover`, `mouseout`.

`--once` stops listening after the first event but **keeps the subscription drainable**,
so `events` can still retrieve what it caught.

### Refs, handles, and staleness

Verbs return plain JSON rows, never live elements — the browser output handler prints
via `JSON.stringify`, and a raw `Element` would render as `{}`. Live elements live in a
per-app registry keyed by a stable ref (`el1`, `el2`, …) that survives repeat finds of
the same element; subscriptions get `sub1`, `sub2`, ….

A ref whose element has left the document fails with `dom: el3 is no longer in the
document — re-run find`, not a DOM exception.

### Synthetic-event caveats

Every dispatched event is `isTrusted: false`, the same limitation `user-event` has.

- Handlers that check `isTrusted` won't fire, and untrusted keys run **no default browser
  action**. The one carve-out: `press Enter` on a text `<input>` inside a `<form>` calls
  `form.requestSubmit()`. It is deliberately narrow — `<textarea>` and non-text inputs are
  excluded, and a `preventDefault()`-ed keydown suppresses it.
- **Clicking a real link or an unprevented submit navigates the page**, which ends the
  session, since peprn is running in the page that just left. Inherent to driving a real
  host page; documented rather than guarded.
- `type` fires one trailing `change` if the value changed (`--change false` to suppress).
  A deliberate departure from `user-event`'s blur-only timing: a programmatic set never
  dirties the browser's change tracking, so vanilla `change` listeners would otherwise
  never fire. React is already served by the per-character `input` events.

---

## Completion and the manual

Every module tree is completable for free — command paths, option names and aliases,
`@handles`, static `choices`, and any dynamic `complete()` hook. Node and bun get Tab
completion through `readline`; the browser gets a fish-style ghost-text overlay, accepted
with `Tab` or `→` and cycled with `Shift+Tab`.

`man`, `man <command>`, and `man <command> <sub>` render NAME / SYNOPSIS / OPTIONS /
EXAMPLES / SUBCOMMANDS straight from the live option specs, so the manual cannot drift
from the code. Plain text on the server, linked HTML in the browser.

**To generate a complete, current command reference programmatically** — including your
own modules, which no static document can cover:

```js
import { buildManIndex, buildManPage, renderManText } from 'peprn'

console.log(renderManText(buildManIndex(modules, 'my-cli')))
console.log(renderManText(buildManPage(modules, ['dom', 'find'])))
```

---

## Writing modules

```ts
import type { Module } from 'peprn'

const greet: Module = {
  help: {
    description: 'say hello',
    examples: { '-n ada': 'greet ada' }
  },
  options: {
    name: { alias: 'n', type: 'string', describe: 'who to greet' }
  },
  fn: (ctx) => `hello, ${ctx.args.options.name ?? 'world'}`
}
```

A module tree is a plain object of `{ [command]: Module }`. Submodules nest under
`submodules`. A module with no `fn` is a pure syntactic branch and contributes no result
key. A `'$'` submodule matches any single token, collected into `ctx.args.wildcards`.

`fn` receives an `Invocation`: `args` (`positional`, `options`, `wildcards`, `modulePath`,
`raw`), `children` (results of deeper modules, keyed by path), `path`, `depth`, and `app`.

**Return an array** from anything meant to compose through `@handles` — a lone object in
a positional slot throws `InjectionError`.

Declaring `type: 'boolean'` makes an option a bare flag that never consumes a value; if
you want `--opt false` to be readable, declare it `type: 'string'` with
`choices: ['true','false']`.

### Entry points

| Import | Provides |
|---|---|
| `peprn` | `createApp`, types, parser/scheduler internals, `buildManPage`, `renderManText`. |
| `peprn/node` | `createNodeApp` — readline loop, Tab completion. |
| `peprn/browser` | `createBrowserApp` — textarea UI, ghost completion, localStorage history. |
| `peprn/react` | `usePeprn` hook and a `<Peprn>` component, isolated so vanilla builds never pull React in. |
| `peprn/match` | `match scalar`. |
| `peprn/dom` | The 14 DOM verbs. |
| `peprn/async` | `sleep`, plus `pollUntil` for your own waits. |

All three constructors are **async** — they return `Promise<AppHandle>`, so `await` them
if you want the handle. A REPL that only needs the prompt can ignore the promise, as the
snippet at the top of this README does.

```js
const app = await createNodeApp({ id: 'cli', modules: { greet } })
const report = await app.run('greet -n ada')
report.result            // { greet: 'hello, ada' }
app.dispose()
```

`AppHandle` carries `id`, `modules`, `handles`, `history`, `disposed`, plus `run()`,
`complete(input, cursor?)`, and `dispose()`. `run()` resolves to a `RunReport` whose
`result` is what the prompt would have printed, alongside `status`, `error`, and the
parsed `args`.

---

## Examples and tests

```
npm run build
node examples/node/index.mjs     # node REPL; runs unmodified under bun
npm run serve                    # browser demo on :8080
npm test                         # unit suite + integration tests driving the real example
```

The browser demo's default UI injects itself if the page supplies no `#cli` / `#cli-out`
elements. To scaffold a standalone React example against the **local** build:

```
node examples/react-generator/generate.mjs --dir ../peprn-react-example
```

## License

MIT
