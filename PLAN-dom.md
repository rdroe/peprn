# peprn/dom — browser event shorthand (post-v1 plan)

Status: planned 2026-08-24, during the v1 rewrite (see PLAN.md). **Execution starts only
after the rewrite lands** — see the sequencing gate below. Scope and packaging decisions
were made explicitly by the author (rdroe) in the planning session; integration facts
were verified against the landed v1 core (file:line notes inline).

## Background

peprn is a zero-runtime-dependency ESM TypeScript library: parse, evaluate, print, and
repeat nested subcommands in node or the browser, with react bindings. The v1 rewrite
(branch `v1`, PLAN.md packets P0–P21) delivers its three headline capabilities:

- **Named async handles** — `cmd … as name` starts without blocking; `@name` in a later
  line awaits that result and splices the resolved **value** (by reference, never
  re-stringified) into the parsed args.
- **Type-ahead completion** — a core completion engine feeding a fish-style ghost-text
  overlay in the browser and readline Tab completion in node, including per-module
  dynamic `complete()` hooks.
- **A real manual** — one `ManPage` model, text renderer on the server, linked HTML in
  the browser.

This plan is the next body of work: a **browser event shorthand** — a set of peprn
modules (`peprn/dom`, sibling to `peprn/match`) that reach into the host page's DOM,
find elements by text/label/locality (buttons, inputs, selects, links), **point at them
onscreen**, and interact with them.

Target coverage ≈ `@testing-library/dom` queries plus `@testing-library/user-event`
interactions — not react-specific — recast as an interactive REPL vocabulary: type into
a particular textarea, choose a particular `<option>` by nth or by text, click a button
found by its label. On top of Testing Library's semantics it adds a **fuzzy / locality
fallback** that Testing Library deliberately lacks: a human at a REPL wants "best guess,
pointed at onscreen, with a score", not a strict-match error.

Decisions taken: scope = **find + act verbs + listen**; packaging = **in this repo** as
`src/modules/dom` with a `"./dom"` export.

Typical session:

```
find email -k textbox as em        # points onscreen at best match, returns ranked rows
type @em "user@example.com"        # user-event-fidelity typing (React controlled inputs work)
select country -n 3                # or: select country "Iceland"
on submit click as clicks          # listen
click submit
events @clicks                     # drain observed events
```

## Hard constraints (verified against the landed v1 core)

1. **Handle injection is by reference, never re-stringified** (`src/core/scheduler.ts:44-78`,
   pinned by `test/scheduler.test.ts:68`). BUT a single non-scalar in a *list* position
   (positionals / array options) throws `InjectionError`, while an **array spreads
   element-by-element unchecked** (`scheduler.ts:33`). → **Every dom verb returns an
   ARRAY of plain-JSON row objects** so `click @btn` / `events @clicks` (positional
   `@ref`) splice legally and uniformly.
2. **Default browser data handler prints `JSON.stringify(result)`** (PLAN.md P13); a raw
   Element renders `{}`. → Rows are pure JSON; live Elements live in a per-app
   **registry** keyed by ref string (`el1`, `el2`, …); staleness = `!el.isConnected` →
   friendly "re-run find" error.
3. **`Module.complete?(prefix, args)`**: async supported, deepest-module-wins, results
   NOT re-filtered by the engine (`src/core/complete.ts:249-272`); the browser ghost
   calls it on every keystroke (rAF-debounced, no timeout). → Live DOM-scouring
   completions must cache candidate extraction (~300ms TTL), self-filter by prefix, and
   cap output. A throw in `complete()` is silently dropped by core.
4. **`"sideEffects": false` + node consumers** → never touch `document`/`window` at
   module top level; every DOM-touching fn/complete guards with `requireDocument()`
   (node → `dom: requires a browser environment`; help/man still work — they never call
   `fn`). The pure scoring layer stays importable everywhere (that is what unit tests hit).
5. **Testing rule (normative, PLAN.md)**: no DOM-emulation dependency. node:test covers
   **pure functions only**; real DOM behavior is verified by serving `examples/browser`
   and driving Chrome via chrome-devtools (same as the ghost overlay, P21).
6. **Zero runtime deps** → hand-rolled fuzzy matcher (bigram Dice coefficient, ~15 lines).
7. **Module package pattern** mirrors `src/modules/match/`: type-only imports from
   `../../core/types.js` (+ `errors.js`); named leaf exports; one `"./dom"` entry in
   `package.json#exports`. Engine fact used below: fn-less modules contribute no result
   key (`src/core/engine.ts:24-25`).

## Sequencing gate

Start **only after** the v1 rewrite finishes and `npm test` is green with P9
(`src/core/app.ts`/`index.ts`), P13 (`src/browser/*`), P21 (`ghost.ts`), and P15
(examples) on disk, and `examples/browser/bundle.js` builds react-free. Until then the
working tree belongs to the rewrite; this document is the only artifact of the feature.

## Design

### Export shape and module tree

`index.ts` exports every leaf by name, `export const domModules: Modules` for top-level
spreading (`modules: { match, ...domModules }` — terse verbs at the prompt), and
`export default dom` — a **fn-less** parent Module `{ submodules: domModules, help }`.
Fn-less matters: the engine skips fn-less modules, so `dom find … as h` registers find's
raw array as the handle and the envelope stays `{ 'dom find': rows }` with no noise key.

**14 leaves**: `find`, `click`, `dblclick`, `type`, `clear`, `select`, `check`,
`uncheck`, `press`, `hover`, `focus`, `on`, `off`, `events`.

Collision note: `clear`, `on`, `events` are generic names; on top-level spread the
consumer's spread order decides, and `dom`-namespaced mounting is always available.

### Universal return-shape rule

Every verb fn returns an **array of rows** (constraint 1). Shapes:

- `MatchRow`: `{ ref: 'el7', nth: 1, tag: 'input', role: 'textbox', name: 'Email',
  via: 'label', score: 0.97, text?: '…≤40ch', testid?: string, x, y, w, h }` (ints).
- Act rows: `{ ref, did: 'click' | 'type' | …, value?: string, changed?: boolean }`.
- `SubRow`: `{ sub: 'sub1', ref: 'el4', events: ['click'], count: 0, live: false }`.
- `EventRow`: `{ sub, ref, seq, type, ts, summary }` (keyboard → `Control+Enter`,
  pointer → `button=0 @ x,y`, input → target value ≤40ch).

### Files (`src/modules/dom/`)

**Pure layer** (the only unit-tested layer, per constraint 5):

| File | Responsibility |
|---|---|
| `types.ts` | `Candidate`, `MatchRow`, `SubRow`, `EventRow`, `RankSpec`, `Source` union, `ROLES` const |
| `fuzzy.ts` | `normalize()` (lowercase, collapse whitespace), `bigrams()`, `dice()` |
| `roles.ts` | `inferRole(tag, typeAttr, roleAttr)` + `ROLES` (table below) |
| `keys.ts` | `parseKeySpec('Control+Shift+a')` → key/code/modifier flags; `keyToCode` table; `isPrintable()` |
| `rank.ts` | `matchStrength()`, `rankCandidates(cands, spec)` incl. `--near` proximity (pure — operates on rect fields) and below-threshold `guesses` |
| `geometry.ts` | `overlayBoxes(rects, viewport)` → outline box + badge position, viewport-clamped |

**Impure layer** (thin; smoke-verified only):

| File | Responsibility |
|---|---|
| `extract.ts` | `extractCandidates(appId)` DOM walk → `Candidate[]` + element refs; 300ms module-level cache; `requireDocument()` guard lives here |
| `registry.ts` | per-app-id state: `{ seq, els: Map, subs: Map, overlay, lastHover }`; stable refs; staleness errors |
| `overlay.ts` | style injection + pointing UI, consuming `geometry.ts` |
| `actions.ts` | event-dispatch sequences + native-setter technique |
| `resolve.ts` | shared `resolveTarget(ctx, opts)` incl. the positional-partition rule |
| `listen.ts` | subscription store, listener wrappers, `serializeEvent` (pure, exported for tests), `--live` append; also defines the `on`/`off`/`events` Modules |

**Module definitions**: `find.ts` (find Module: fn + options + help + complete),
`act.ts` (the ten act-verb Modules — thin: resolveTarget → actions → rows), `index.ts`.

Plus `test/dom.test.ts` and the `package.json` diff — add after `"./match"`:

```json
"./dom": { "types": "./dist/modules/dom/index.d.ts", "default": "./dist/modules/dom/index.js" }
```

No build/tsconfig changes (`lib` already has `DOM`; `rootDir: src` covers it).

### `find`

Positionals joined with single spaces = query text (quoting already supported).

| option | alias | type | choices / notes |
|---|---|---|---|
| role | k | string | ROLES; require this inferred role (hard filter) |
| label, placeholder, text, testid, value, alt, title | | string | per-source narrowing (testing-library-style); with no positional query, the option value becomes the query for that source alone |
| near | | string | rank matches nearer to this anchor text |
| nth | n | number | pick the Nth ranked match (1-based) |
| all | | boolean | return up to 25 rows instead of 5 |
| exact | x | boolean | exact normalized match only (no fuzzy) |
| quiet | q | boolean | skip the onscreen pointer |
| clear | | boolean | clear the overlay (alone: just clear, return `[]`) |
| limit | | number | max rows (default 5; `--all` 25) |

`ROLES = ['button','link','textbox','checkbox','radio','combobox','listbox','option','slider','heading','img','generic']`.

`find.complete()`: distinct candidate names (label ∪ aria ∪ text ∪ placeholder, ≤30ch,
cap 12), prefix-filtered, **unquoted even when multi-word** — find joins positionals,
and quoting would break `ghostRemainder`'s proper-prefix rule (PLAN.md P21).

### Ranking (implementable spec, all pure)

`matchStrength(q, v, exact)` on normalized strings — take the highest tier:
equality **1.0** · `v.startsWith(q)` **0.9** · word-prefix **0.85** · substring
**0.75** · `dice ≥ 0.34` (unless `--exact`) → mapped onto the fuzzy band
**[0.32, 0.74]** · else 0, where `dice` is the best coefficient over the whole
value and over each of its words.

Both of those differ from this plan's first draft (`dice × 0.7`, whole-string
only), which was corrected during implementation:

- Whole-string dice lets extra words in a label bury a typo of the word actually
  typed: `dice("sumbit", "submit order") = 0.25` versus `0.40` against `"submit"`
  alone, so the longer label scored *worse* than the bare word. Per-word scoring
  removes that penalty.
- A flat `× 0.7` made the stated `0.34` gate misleading rather than wrong: the
  real floor was `0.3 / 0.7 = 0.43` (0.45 against a `text` source), so dice in
  `[0.34, 0.45)` was admitted by the gate and then silently dropped by the 0.3
  threshold. The band maps the admissible range onto scores that can actually
  survive, while staying under the substring tier.

Source weights: label **1.0**, aria **0.98**, text **0.95**, placeholder **0.9**,
value **0.85**, title **0.8**, alt **0.8**, testid **0.75**.
`base = max(strength × weight)` over present sources; record `via` + `name`.
Modifiers: role + narrowing options are hard filters; `!visible` ×0.5; disabled ×0.8.
`--near anchor`: rank the anchor itself, take top hit's rect center `C`;
`p = 1/(1 + dist/200)`; `final = score × (0.7 + 0.3p)`. Ties: score → visible →
document order.

Threshold 0.3. When nothing survives, `find` **throws** a friendly error carrying the
top-3 below-threshold guesses — `dom: no match for "sbmit" — closest: button "Submit"
(el4, 0.28), …` — and still registers their refs so the user can act on a guess.

Role inference: explicit `role` attr wins; else `button` ← `<button>`,
`input[type=button|submit|reset|image]`; `link` ← `a[href]`; `textbox` ← `<textarea>`,
`[contenteditable=true]`, `<input>` of any type not in
`{checkbox,radio,button,submit,reset,range,color,file,hidden,image}` (pragmatic:
`type=number` → `textbox`, noted in help); `checkbox`/`radio` ← input types;
`combobox` ← `<select>` (`multiple` → `listbox`); `option`, `slider` ←
`input[type=range]`, `heading` ← h1–h6, `img`; else `generic`.

### Extraction, registry, staleness

`extract.ts`: `querySelectorAll` over a selector union (`button, a[href], input, select,
textarea, option, [role], [tabindex], [data-testid], label, h1–h6, img[alt], [title],
[contenteditable="true"], summary`), deduped, capped ~1500 elements. **Skip the REPL's
own UI**: drop anything matching `el.closest('.peprn-default, .peprn-default-out,
.peprn-ghost, .peprn-dom-layer, .peprn-man')` — otherwise `find button` finds the REPL
itself. Accessible names: `label[for]` / wrapping label / resolved `aria-labelledby`;
`aria-label`; collapsed `textContent` (≤80ch; `value` for `input[type=button|submit]`);
`el.value` (selected option text for `<select>`); placeholder/title/alt/testid attrs.
`visible` = `getClientRects().length > 0` and computed visibility; `rect` from
`getBoundingClientRect()`. Cache `{ at, rows }` 300ms (shared by fn + complete paths).

`registry.ts`: `Map<appId, DomState>`; `storeElements` reuses an existing ref for the
same Element identity (stable refs across finds); prunes disconnected entries per find;
soft cap 200 (evict oldest disconnected first). `resolveRef`: unknown → `dom: no
element "el9" — run find first`; disconnected → `dom: el3 is no longer in the document —
re-run find`. Known bounded leak: state persists after `app.dispose()` (modules have no
dispose hook) — commented, accepted.

### Target resolution (positional-partition rule)

Implemented once in `resolve.ts`, used by every verb. Partition `args.positional` into:
row objects (string `.ref`) · SubRows (string `.sub`) · registry-ref strings
(`/^el\d+$/`) · sub-ref strings (`/^sub\d+$/`) · remaining words. Target precedence:
row objects → ref string → leading words as an implicit find (quiet ranking, honors
`--nth/--near/--role`). Remaining words return as `rest` for the verb's trailing
argument (type text, select choice, press key, on event names) — so `type @em hello`
composes naturally (spliced rows arrive first, `'hello'` is left over). `-t/--target`
single-value option also accepted. On success, flash the pointer ~1.2s on the resolved
element unless `--quiet`.

### Act verbs (user-event-grade sequences, `actions.ts`)

All events `{ bubbles: true, cancelable: true, composed: true }`; `PointerEvent` where
the constructor exists, else `MouseEvent`; coordinates = rect center.

- `nativeSetValue(el, v)` — **the React-controlled-input technique**: pick prototype by
  tag (`HTMLInputElement` / `HTMLTextAreaElement` / `HTMLSelectElement`) and call
  `Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)`; likewise
  `nativeSetChecked` via the `checked` descriptor.
- **click**: if `lastHover ≠ el`, leave-sequence on the old; then `pointerover,
  pointerenter, mouseover, mouseenter, pointermove, mousemove, pointerdown, mousedown`,
  `el.focus()` if focusable, `pointerup, mouseup`, `click` (`detail:1, button:0`).
  Untrusted `click` still runs activation behavior (checkbox toggle, link navigation).
  `dblclick`: second down/up/click with `detail:2`, then `dblclick`.
- **type** `<target> <text>` (single positional = text, target = `activeElement` if it
  is a text control, else a friendly error): focus via click seq; per char `keydown →
  keypress (printable) → beforeinput (InputEvent, insertText) → nativeSetValue(el,
  accumulatedTextSoFar) → input (InputEvent) → keyup`; `--delay <ms>` between chars;
  `change` once at end if the value changed (`--change false` to suppress) — a deliberate
  fidelity deviation from user-event's blur-only timing: programmatic sets never dirty
  the browser's change tracking, so vanilla `change` listeners would otherwise never
  fire; React is already served by the `input` events. No `{enter}` DSL — that is
  `press`'s job (documented in help). Two implementation corrections to this spec:
  the accumulator must live OUTSIDE the element (reading `el.value` back loses
  everything typed on `input[type=number|date|time|month|week|datetime-local]`,
  whose value sanitizers coerce every invalid intermediate prefix to `''`), and
  `--change` must not be declared `type: 'boolean'` (the core parser treats boolean
  options as bare flags and never consumes a following value, so `--change false`
  would set it true and type the word "false" into the field).
- **clear**: focus; `beforeinput (deleteContentBackward)` → `nativeSetValue(el, '')` →
  `input` → `change`.
- **select** `<target> <option query>`: resolve among `el.options` — exact text → exact
  value → substring → Dice fuzzy over texts; `--value` restricts to value matching;
  `--index N` (1-based); `--add` for multi-select append. Set via `nativeSetValue`
  (or `option.selected = true` for `--add`) → `input` + `change`. No synthetic
  option-popup mouse events (documented simplification).
- **check / uncheck**: already in desired state → `{ changed: false }` no-op row; else
  the click sequence (activation toggles and fires input/change natively); verify, and
  if still unchanged force `nativeSetChecked` + `input` + `change`.
- **press** `[target] <keyspec>` (`Control+Shift+a` syntax; no target →
  `activeElement`/body; `--repeat N`): `keydown` (+`keypress` if printable) → `keyup`
  with modifier flags. Untrusted keys run no default browser actions; the one deliberate
  convenience, mirroring user-event's implicit submission: **Enter on a text control
  inside a `<form>` calls `form.requestSubmit()`**. Everything else is documented
  no-default-action, with `click` as the remedy.
- **hover**: leave-sequence on `lastHover`, then `pointerover, pointerenter, mouseover,
  mouseenter, pointermove, mousemove`; records `lastHover`. **focus**: `el.focus()`,
  falling back to dispatching `focus` + `focusin` if not taken.

### Listen: `on` / `off` / `events` (`listen.ts`)

- `on <target> [event…] [as name]`: events from positional words merged with `-e/--event`
  (array option, choices: click, dblclick, input, change, keydown, keyup, submit, focus,
  blur, pointerdown, pointerup, mouseover, mouseout; default `click`). Creates
  `Sub = { id: 'subN', ref, el, events, buffer (ring, cap 100), count, live, once,
  handlers }`; never calls `preventDefault`. Handler: `count++`, push
  `serializeEvent(ev)`; `--live` also appends one line per event directly to
  `document.getElementById(appId + '-out')` (the public P13 DOM contract; best-effort —
  buffer-only if absent) — the dataHandler can't carry late events since it fires once
  per task; `--once` auto-offs after the first event. Returns `[SubRow]`.
- `events [@sub…]` drains buffers (none/`--all` = every sub, merged by seq;
  `--keep` peeks; `--limit N`) → `EventRow[]`.
- `off @sub… | --all`: removes listeners, deletes subs, prunes stale → `[{ off: 'sub1' }]`.

### Overlay ("point at it")

P21-style split: pure `geometry.overlayBoxes` + impure applier. `<style
id="peprn-dom-style">` injected once; one `<div class="peprn-dom-layer">` appended to
`document.body` (`position: fixed; inset: 0; pointer-events: none;
z-index: 2147483646` — direct body child so transformed-ancestor fixed-position
breakage can't apply). Per match: `.peprn-dom-point` outline (2px, radius, soft shadow;
top match accented, others muted) + `.peprn-dom-badge` numbered chip (nth), clamped
into the viewport. Top match `scrollIntoView({ block: 'center' })`, measure after one
rAF; reposition on `resize` + `scroll` (capture: true), rAF-throttled. TTL 8s (reset per
`pointAt`); `find --clear` clears; act-verb flash = single-entry `pointAt` with a
`.peprn-dom-flash` pulse, 1.2s TTL.

### Completion hooks

Parent `dom` defines none (leaves stay authoritative). All hooks: environment guard
returns `[]` in node; self-filter case-insensitively by prefix; ride the 300ms cache.
Act verbs at position 0: registry refs (`elN`) + candidate names. Later positions:
`select` → the resolved target's option texts (try/catch); `press` → static key list;
`on` → event names; `off`/`events` → live sub refs; `type` → nothing.

### help / man

Every leaf gets `help.description`, option `describe`s (choices auto-flow to completion
and man via OptionSpec), and 2 examples keyed by bare verb form. Parent description:
`'find and drive elements on this page (testing-library-style queries as REPL verbs)'`.
`man dom` → subcommand index of all 14 leaves; `man dom find` shows the `--role`
choices table; `press` help carries the no-default-actions warning; `type` help carries
the change-event note and "no {enter} DSL — use press".

## Unit tests — `test/dom.test.ts` (pure only, ~30 cases)

fuzzy (`dice('submit','sbmit') ≈ 0.67`, identity, disjoint, normalize) · roles
(`<button>` / `input[type=submit]` / `[role=button]` all → button; explicit role beats
tag; select→combobox, multiple→listbox) · keys (`Control+Shift+a` flags + `KeyA`;
Enter; printable detection) · rank (tier ordering; source weighting; role hard filter;
`--exact` drops fuzzy; hidden ×0.5 reorders; `--near` flips same-named buttons via
rects; nth; empty outcome carries 3 guesses; tie-break by document order) · geometry
(badge clamped at offscreen rects) · `serializeEvent` (keyboard combo, input value
truncation, pointer coords).

## Example + chrome-devtools smoke

Extend `examples/browser/index.html` with a demo block above the REPL mount:
`<form id="demo">` — labeled email + password inputs, placeholder-only search,
`select#country`, checkbox "Subscribe", buttons "Submit order" / "Cancel", a link, a
`data-testid` div, `#demo-log`; inline script `preventDefault`s submit, logs to
`#demo-log`, records events into `window.__seen`. `examples/browser/main.mjs`:
`createBrowserApp({ id: 'cli', modules: { match, ...domModules } })`.
`scripts/build-examples.mjs` unchanged (react-leak guard unaffected).

Smoke (serve on 8080, drive via chrome-devtools): (1) `find email` → screenshot shows
outline+badge on the email input; row has `role:'textbox', via:'label'`. (2) `find
submit --role button as btn` → `click @btn` → `#demo-log` gains a line (the handle
array spliced through a positional, end-to-end). (3) `type el1 "user@example.com"` →
verify value + `__seen` input events via script; on the react-generator example, verify
a controlled input's state updates (native-setter path). (4) `select country Germany`
and `select country -n 3`. (5) `check subscribe` / `uncheck subscribe`. (6) `on @btn -e
click as sub` → `click @btn` → `events sub1` drains → `off --all`. (7) `press el1
Enter` → submit handler fired (requestSubmit path). (8) `find zzzz` → guesses error;
`find sumbit` (typo) still points at Submit; `find --clear` → overlay gone. (9) ghost:
`find Sub` value-completes `Submit order`. (10) reload mid-session → `click el1` → the
friendly staleness error. Plus no regressions: `match scalar …`, ghost, `man`,
localStorage history.

## Implementation phases (each ends with green `npm test`)

1. **Pure layer**: types, fuzzy, roles, keys, rank, geometry + `test/dom.test.ts`.
2. **Impure plumbing**: extract, registry, overlay, resolve (compile-only gate).
3. **find + packaging**: find.ts, index.ts, `"./dom"` export. Gate: dist artifacts
   exist; a node scratch import of `peprn/dom` doesn't throw at import time.
4. **Act verbs**: actions.ts + act.ts.
5. **Listen**: listen.ts.
6. **Example + smoke** (the script above, with screenshots).
7. README section (coordinate with P18's text): queries, verbs, handles workflow, fuzzy
   behavior, untrusted-event caveats.

## Risks / decisions on record

- Synthetic events are `isTrusted: false`; handlers that check it won't fire, and
  untrusted keys run no default actions (same limitation as testing-library).
  Documented; the sole convenience carve-out is Enter → `requestSubmit()` in `press`.
- Clicking a real link or a non-prevented submit **navigates the host page** and ends
  the REPL session — inherent to "reach into the host page"; documented in `click`
  help, not guarded.
- `change`-at-end-of-`type` deviates from user-event's blur-only timing; deliberate,
  documented.
- Per-keystroke completion cost bounded by the 300ms cache + 1500-element scan cap;
  worst case is "no ghost", never a broken prompt.
- Registry holds strong Element refs (FIFO-capped, pruned per find); persists past
  `dispose()` (no module dispose hook) — bounded, commented.
- Generic verb names (`clear`, `on`, `events`) can collide on top-level spread;
  consumer's spread order decides; namespaced `dom` mounting always available.
