# peprn

Parse, evaluate, print, and repeat nested subcommands — a REPL for node, bun, and the
browser that runs custom CLI-style commands you define as a tree of modules.

- **Zero runtime dependencies.** ESM only, works identically on node ≥18 and bun.
- **User-typed asynchronicity.** Any line can start without blocking (`as name`) and
  a later line can await its result by reference (`@name`) — no re-stringifying.
- **Type-ahead completion.** Command paths, options, and `@handles`, as Tab
  completion on the server and a ghost-text overlay in the browser.
- **A real manual.** `man <command>` renders a derived page — text on the server,
  linked HTML in the browser — so it can never drift from the actual option specs.
- **React bindings**, isolated in their own entry point so the vanilla browser build
  never pulls react in.

## Install

```
npm install peprn
```

(or yarn, pnpm, bun — the published package has no lockfile and no install scripts,
so any package manager works identically.)

## Run the node example

Clone the repo, then:

```
npm install
npm run build
node examples/node/index.mjs
```

At the `>` prompt, type:

```
match scalar -l 1 a hellllllo world -r 1 b hellllllllllo world
```

The result:

```
{
  'match scalar': [
    { index: 0, match: true, left: 1, right: 1 },
    { index: 1, match: false, left: 'a', right: 'b' },
    {
      index: 2,
      match: false,
      left: 'hellllllo',
      right: 'hellllllllllo'
    },
    { index: 3, match: true, left: 'world', right: 'world' }
  ],
  match: 4
}
```

`'match scalar'` is the array of per-index comparisons; `match` is the parent
command's own result — the flattened count of everything its children returned.
Every result object is keyed by module path, childmost-first.

The same example runs unmodified under bun:

```
bun examples/node/index.mjs
```

(bun's `node:repl` is a stub, so peprn owns a plain `node:readline` loop instead —
identical behavior on both runtimes, right down to Tab completion.)

## Async handles

A command can be suffixed `as <name>` to register its result under a handle instead
of blocking the next line, and a later line can reference `@<name>` to wait for it
and splice the **resolved value** into that argument position — never re-stringified,
so object identity survives the trip:

```
> match scalar -l 5 -r 5 as fives
{ 'match scalar': [ { index: 0, match: true, left: 5, right: 5 } ], match: 1 }
> match scalar -l @fives -r @fives
{
  'match scalar': [
    {
      index: 0,
      match: true,
      left: { index: 0, match: true, left: 5, right: 5 },
      right: { index: 0, match: true, left: 5, right: 5 }
    }
  ],
  match: 1
}
```

Lines without `as` run sequentially, each waiting for the previous one to settle.
Lines with `as` start immediately and never block anything — only an explicit
`@name` reference waits. A missing or failed handle fails only the task that
referenced it; every other task in the same input still runs and reports its own
result. Handles persist for the life of the app, across prompts.

## Completion

Every module tree is completable for free — command paths, option names and
aliases, `@handles`, and (if a module declares them) static `choices` or a dynamic
`complete()` hook.

- **Node/bun:** Tab completion, wired through `node:readline`'s `completer`.
- **Browser:** a fish-style ghost-text overlay — the completion appears dimmed
  inline after the cursor; `Tab` or `→` accepts it, `Shift+Tab` cycles.

## The manual

```
> man
> man match
> man match scalar
```

renders a page derived straight from each module's option specs and help
metadata, so it can never go stale: NAME, SYNOPSIS, OPTIONS, EXAMPLES,
SUBCOMMANDS. On the server it's plain text; in the browser it's linked HTML — each
subcommand is a clickable link that runs `man` one level deeper. `<command>
--help`/`-h` still gives the quick one-level summary.

## Browser example

```
npm run build
npm run serve
```

then open `http://localhost:8080`. The default UI (a textarea and an output pane)
injects itself if the page doesn't supply its own `#cli` / `#cli-out` elements —
run the `match scalar` example above, try ghost-text completion, or `man match`.

## peprn/dom — browser event shorthand

`peprn/dom` (`import { domModules } from 'peprn/dom'`) is a set of modules that reach into
the host page's DOM, **point at elements onscreen**, and drive them — a REPL vocabulary
covering roughly what `@testing-library/dom` queries plus `@testing-library/user-event`
interactions cover, minus any React-specific assumptions. Mount every verb at the top
level (`modules: { match, ...domModules }`) or namespaced (`modules: { dom }`, then
`dom find …`, `dom click …`); a few of the 14 leaf names (`clear`, `on`, `events`) are
generic enough to collide with modules you write yourself, so the namespaced mount is
the collision-free option. It's browser-only — every verb throws a friendly `dom:
requires a browser environment` if it's ever reached from node.

### Query verb: `find`

```
> find email -k textbox as em
[ { ref: 'el3', nth: 1, tag: 'input', role: 'textbox', name: 'Email', via: 'label',
    score: 0.97, x: 24, y: 96, w: 240, h: 28 } ]
```

`find <query text>` scores every candidate element on the page against your query text
(exact match, prefix, substring, or fuzzy — see below), **points at the top matches
onscreen** with a numbered outline overlay, and returns a ranked array of rows. Refine
with:

- `-k/--role` — hard-filter to an inferred role (`button`, `link`, `textbox`,
  `checkbox`, `radio`, `combobox`, `listbox`, `option`, `slider`, `heading`, `img`,
  `generic`).
- `--label`, `--placeholder`, `--text`, `--testid`, `--value`, `--alt`, `--title` —
  narrow the query to one specific source instead of scoring it against all of them.
- `--near <anchor text>` — rank matches closer onscreen to another element higher.
- `-n/--nth <N>` — take the Nth-ranked match instead of the top one.
- `--all` — return up to 25 rows instead of the default 5; `--limit <N>` sets an exact cap.
- `-x/--exact` — equality only, no fuzzy fallback.
- `-q/--quiet` — skip the onscreen pointer.
- `--clear` — clear the overlay (alone, with no query, it just clears and returns `[]`).

Every unit of a query is scored per source (label 1.0, aria 0.98, text 0.95, placeholder
0.9, value 0.85, title 0.8, alt 0.8, testid 0.75, proximate 0.6) and per tier (exact match 1.0, prefix
0.9, word-prefix 0.85, substring 0.75, else a bigram-similarity fuzzy score above a 0.34
floor) — the highest source×tier product wins, with hidden elements halved
and disabled elements ×0.8. The fuzzy score is the better of the whole-string and
per-word coefficients, so extra words in a label don't bury a typo of the word you
actually typed. Nothing below an overall score of 0.3 counts as a match:
`find sumbit` (a typo) still finds "Submit order", but a query that matches nothing throws a
friendly error carrying its top 3 near-misses (`dom: no match for "sbmit" — closest:
button "Submit" (el4, 0.71), …`) rather than silently returning an empty array, and it
still registers those guesses' refs so you can act on one anyway.

#### Controls the markup never named

Plenty of real pages label a control to the eye but not to the DOM — a `<span>` sitting
before an `<input>`, a cell to the left of one — with no `for`, no wrapping `<label>`,
no `aria-*`. Two things handle that.

Where the pairing is explicit in the markup, it counts as a `label` like any other:
`<dt>` names the control in its `<dd>`, and a `<th>` (or a `headers` attribute) names
controls in the cells beneath or beside it.

Where nothing connects them, `find` falls back to the text *next to* the control —
reported as `via: "proximate"`. It walks up at most three levels looking at preceding
siblings and the parent's own text, so `<span>Coupon</span> <input>` and
`<div>Referrer <input></div>` both resolve; checkboxes and radios are scanned forwards
first, since their label conventionally follows. This is structural, not geometric —
`--near` covers the visual axis, and the two fail in opposite directions.

```
type coupon SAVE20        # no for=, no <label> — found via the <span> beside it
check "gift wrap"         # checkbox whose caption follows it
type quantity 12          # <input> in a cell under a <th>Quantity</th>
```

Two deliberate properties. A proximate name is weighted below every stated source, so it
can only add matches that previously scored zero — it can never displace a name the page
actually declared. And the element that *provided* the text is demoted, so `find coupon`
lands on the input rather than the inert `<span>` that captions it. Because this is the
one place `find` infers rather than reads, `via` always tells you which happened.

### Act verbs

`click`, `dblclick`, `type`, `clear`, `select`, `check`, `uncheck`, `press`, `hover`,
`focus` — each resolves a target (see below), plays out a full user-event-fidelity
sequence of DOM events, and returns `[{ ref, did, value?, changed? }]`:

```
> type @em user@example.com
[ { ref: 'el3', did: 'type', value: 'user@example.com', changed: true } ]
> select country Germany
[ { ref: 'el5', did: 'select', value: 'Germany', changed: true } ]
> check subscribe
[ { ref: 'el7', did: 'check', changed: true } ]
```

`click`/`dblclick` play the full pointer sequence (`pointerover` … `pointerdown` …
`click`) and let the browser run real activation behavior (checkbox toggle, link
navigation, form submit). `type <target> <text>` drives one `keydown` /
`keypress` / `beforeinput` / `input` / `keyup` cycle per character through each
framework's native-setter technique, so React-controlled inputs pick it up correctly; a
lone positional with no explicit target types into whatever's currently focused. `select
<target> <option query>` matches `<select>` options by exact text, exact value,
substring, then fuzzy (or `--index N` / `--value` to pick more directly). `check` /
`uncheck` are no-ops if the control is already in the desired state. `press [target]
<keyspec>` takes `Control+Shift+a`-style key combos. Every act verb accepts the same
targeting options as `find`'s narrowing (`-k/--role`, `--near`, `-x/--exact`, `-n/--nth`)
plus `-t/--target` for an explicit ref/query, and flashes the resolved element onscreen
for ~1.2s unless `-q/--quiet`.

### Listen verbs: `on` / `off` / `events`

```
> on submit click as clicks
[ { sub: 'sub1', ref: 'el9', events: [ 'click' ], count: 0, live: false } ]
> click @clicks
[ { ref: 'el9', did: 'click' } ]
> events @clicks
[ { sub: 'sub1', ref: 'el9', seq: 1, type: 'click', ts: 1234, summary: 'button=0 @ 84,236' } ]
> off --all
[ { off: 'sub1' } ]
```

`on <target> [event…] [as name]` attaches real listeners (default `click`; `-e/--event`
also accepts `input`, `change`, `keydown`, `keyup`, `submit`, `focus`, `blur`,
`pointerdown`, `pointerup`, `mouseover`, `mouseout`) and buffers what it observes — it
never calls `preventDefault`, so the page behaves exactly as it would unwatched.
`events [@sub…]` drains the buffer (default: every live subscription, oldest first;
`--keep` peeks instead of draining, `--limit N` caps it). `off @sub… | --all` removes
listeners and drops the subscription.

### The handle/@ref workflow

`find` and `on` return arrays of plain JSON rows — never live DOM elements, since the
default browser output handler prints results via `JSON.stringify` and a raw `Element`
would render as `{}`. Live elements instead live in a per-app **registry**, keyed by a
stable ref string (`el1`, `el2`, …) that survives repeat `find`s of the same element;
`on` subscriptions get their own `sub1`, `sub2`, … refs the same way. Every dom verb
returns an **array** specifically so it splices legally through `@name` (a positional
array-splice is unchecked per element, while a single non-array object in that slot
would throw `InjectionError`) — that's what lets `as`/`@` compose naturally:

```
> find submit -k button as btn      # registers find's row array under the handle 'btn'
> click @btn                        # @btn resolves to that array; click reads its first row
> on @btn click as clicks           # same handle, now targeting `on`
```

You can also act directly on a bare ref (`click el4`) or skip handles entirely and let
any act verb run its own quiet implicit `find` from your query words (`click submit`) —
whatever's left over after the target is consumed becomes that verb's own argument, so
`type @em hello` and `select country Iceland` compose the same way. A stale ref (the
element left the document — a re-render, a navigation) fails with a friendly `dom: el3
is no longer in the document — re-run find` rather than a DOM exception.

### Untrusted-event caveats

Every event `peprn/dom` dispatches is synthetic and therefore `isTrusted: false` — this
is the same limitation `@testing-library/user-event` has, and it means two things in
practice:

- **A handler that explicitly checks `event.isTrusted` won't fire**, and untrusted key
  events run no default browser action at all. The one deliberate convenience carved out
  on top of that: **`press`'s Enter, on a text `<input>` inside a `<form>`, calls
  `form.requestSubmit()`** directly — mirroring the implicit-submission behavior a real
  Enter keypress gets from the browser. It is deliberately narrow, because an
  unprevented submit navigates the page and ends the session: `<textarea>` is excluded
  (Enter inserts a newline there), as are non-text inputs, and a handler that calls
  `preventDefault()` on the keydown suppresses it just as it would a real default
  action. Everything else is genuinely no-default-action; use `click` on the actual
  button instead.
- **Clicking a real link, or a submit button whose handler doesn't call
  `preventDefault`, navigates the host page** — and ends the REPL session, since the
  page peprn is running in is the one that just navigated away. This is inherent to
  reaching into a real host page rather than a sandbox, so it's documented (in `click`'s
  own `--help`) rather than guarded against.

`type` also fires a trailing `change` event once at the end if the value actually
changed (`--change false` to suppress it) — a deliberate departure from
`user-event`'s blur-only timing, since a programmatic value set never dirties the
browser's own change-tracking and a vanilla `change` listener would otherwise never see
one; React inputs are already served by the per-character `input` events.

## React

```js
import { usePeprn } from 'peprn/react'

function Cli() {
  const { inputRef, outputRef } = usePeprn({ modules: { match } })
  return (
    <>
      <textarea ref={inputRef} />
      <pre ref={outputRef} />
    </>
  )
}
```

or use the bundled `<Peprn options={{ modules: { match } }} />` component directly.

To generate a standalone runnable react example (installs the **local** build via
`npm pack`, not the npm registry):

```
node examples/react-generator/generate.mjs --dir ../peprn-react-example
cd ../peprn-react-example && npm run build && npm run serve
```

Pass `--dry-run` to preview the actions without writing anything, or `--force` to
write into a non-empty directory.

## Writing your own modules

```ts
import type { Module } from 'peprn'

const greet: Module = {
  help: { description: 'say hello' },
  options: { name: { alias: 'n', describe: 'who to greet' } },
  fn: (ctx) => `hello, ${ctx.args.options.name ?? 'world'}`
}
```

A module tree is a plain object of `{ [command]: Module }`. Submodules nest under
`submodules`; a module with no `fn` is purely a syntactic branch. A `'$'` submodule
name matches any single token as a dynamic segment, collected into
`ctx.args.wildcards`.

```ts
import { createNodeApp } from 'peprn/node'

createNodeApp({ id: 'cli', modules: { greet } })
```

`createBrowserApp` (from `peprn/browser`) has the same shape, plus DOM/history
options. Both return an `AppHandle` with `run()`, `complete()`, and `dispose()`.

## Test

```
npm test
```

Runs the full unit suite plus a set of integration tests that build the project
and drive the real node example as a subprocess — including a bun leg, when `bun`
is on `PATH` — asserting the README transcript above byte-for-byte.
