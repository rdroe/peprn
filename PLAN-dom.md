# peprn/dom — browser event shorthand (post-v1 plan)

Status: planned 2026-08-24, during the v1 rewrite (see PLAN.md). **Execution starts only
after the rewrite lands** — see the sequencing gate below. Scope and packaging decisions
below were made explicitly by the author (rdroe) in the planning session.

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

The target coverage is roughly `@testing-library/dom` queries plus
`@testing-library/user-event` interactions — not react-specific — recast as an
interactive REPL vocabulary: a user might type into a particular textarea, choose a
particular `<option>` by nth or by text, click a button found by its label. On top of
Testing Library's semantics it adds a **fuzzy / locality fallback** that Testing Library
deliberately lacks: a human at a REPL wants "best guess, pointed at onscreen, with a
score", not a strict-match error.

Decisions taken: scope = **find + act verbs + listen** (the full loop, including an
event-listening shorthand); packaging = **in this repo** as `src/modules/dom` with a
`"./dom"` export.

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
   ARRAY of row objects** so `click @btn` / `events @clicks` (positional `@ref`) splice
   legally and uniformly.
2. **Default browser data handler prints `JSON.stringify(result)`** (PLAN.md P13); a raw
   Element renders `{}`. → Rows are **pure JSON**; live Elements live in a per-app
   **registry** keyed by ref string (`el1`, `el2`, …); staleness = `!el.isConnected` →
   friendly "re-run find" error.
3. **`Module.complete?(prefix, args)`**: async supported, deepest-module-wins, results
   NOT re-filtered by the engine (`src/core/complete.ts:249-272`); the ghost calls it on
   every keystroke (rAF-debounced, no timeout). → Live DOM-scouring completions must
   cache candidate extraction (~300ms TTL), self-filter by prefix, and cap output.
4. **`"sideEffects": false` + node consumers** → never touch `document`/`window` at
   module top level. In node, verbs throw `peprn/dom requires a browser environment`;
   the pure scorer stays importable everywhere (that is what unit tests hit).
5. **Testing rule (normative, PLAN.md)**: no DOM-emulation dependency. node:test covers
   **pure functions only**; real DOM behavior is verified by serving `examples/browser`
   and driving Chrome via chrome-devtools (same as the ghost overlay, P21).
6. **Zero runtime deps** → hand-rolled fuzzy matcher (bigram Dice coefficient, ~15 lines).
7. **Module package pattern** mirrors `src/modules/match/`: imports from
   `../../core/types.js` (+ `errors.js`) only; parent Module default export + named leaf
   exports; one `"./dom"` entry in `package.json#exports`.

## Sequencing gate

Start **only after** the v1 rewrite finishes and `npm test` is green with P9
(`src/core/app.ts`/`index.ts`), P13 (`src/browser/*`), P21 (`ghost.ts`), and P15
(examples) on disk. Until then the working tree belongs to the rewrite; this document is
the only artifact of the feature.

## Design

### Files (`src/modules/dom/`)

| File | Responsibility |
|---|---|
| `types.ts` | `Candidate`, `MatchRow`, `SubscriptionRow`, `RankOptions` shapes (pure data) |
| `score.ts` | **PURE**: `normalize()`, `bigramDice()`, `roleOf()` implicit-role table, `rank(candidates, query, opts)` with per-source weights + `--near` rect proximity |
| `candidates.ts` | DOM-side extraction → `Candidate[]`: accessible names from `label[for]`/wrapping label, `aria-label(ledby)`, visible text, placeholder, title, alt, current value, `data-testid`; visibility/disabled; 300ms cache, ~500-candidate cap |
| `registry.ts` | per-app-id ref registry (`Map`, FIFO cap ~200) + shared `resolveTarget(ctx)` + staleness errors |
| `overlay.ts` | onscreen pointing: outline + numbered badge per match; pure `markerLayout(rects)` geometry helper |
| `events.ts` | dispatch sequences (click/type/press/hover/select/check/clear/focus), native prototype value-setter helpers, `keyInfo(key)` key/code table (pure) |
| `listen.ts` | `on`/`off`/`events` subscriptions (ring buffer, max 100 events each) |
| `find.ts` | the `find` verb: extract → rank → overlay.point → registry.store → rows |
| `index.ts` | assembles verb Modules; exports: named verbs, `domModules: Modules` (for top-level spread `modules: { match, ...domModules }`), default parent `dom` Module (namespaced fallback) |

Plus `test/dom.test.ts` (pure functions only) and a `"./dom"` exports entry in
`package.json` (`types`/`default` → `dist/modules/dom/index.*`, mirroring `./match`).
No build/tsconfig changes needed (`lib` already includes `DOM`; `rootDir: src` covers it).

### `find`

- Positionals joined = query text (quoting already supported by the tokenizer). Options:
  `-k/--kind` (choices: `button link textbox checkbox radio combobox option heading img any`),
  explicit per-source narrowing `--label --placeholder --text --testid --value --alt --title`,
  `--near <text>`, `-n/--nth <number>`, `--all`, `--exact` (no fuzzy), `--quiet` (no
  overlay), `--clear` (just remove overlay).
- `MatchRow = { ref, tag, role, name, score, disabled?, rect: {x,y,w,h} }` — returns the
  top row as `[row]`, or all ranked rows with `--all`; score reported so fuzzy guesses
  are transparent.
- Ranking (pure, heavily unit-tested): normalized exact > word-prefix > substring >
  bigram-Dice fuzzy (threshold ~0.4), weighted by source (label ≥ aria > text >
  placeholder > title > testid > alt > value), penalties for hidden/disabled, kind
  filter via `roleOf()` inference (`<button>`, `input[type=submit|button]`,
  `[role=button]` all answer `button`; `input[type=text|email|…]`, `textarea` →
  `textbox`; `<select>` → `combobox`; etc.), `--near` adds a rect-distance term.
- `complete()`: returns candidate names from the live DOM (cached), prefix-filtered — so
  ghost text suggests actual on-page labels.

### Target resolution (all act verbs)

`resolveTarget(ctx)`: first positional is a row object (from `@handle` — arrays spread,
so rows arrive as positionals; `-n` picks among several) | a ref string `'el3'` | plain
text → implicit `find`, top match. Also accepted via a `-t/--target` single-value
option. Stale ref → error naming the fix (re-run `find`).

### Act verbs (user-event-grade sequences)

- `click` (`--double` adds dblclick): `pointerdown mousedown → focus → pointerup mouseup
  → click`, bubbling + composed.
- `type <target> <text>` per char: `keydown → beforeinput →` **native prototype value
  setter** (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, …)`;
  same for TextArea/Select prototypes — this is what makes React controlled inputs
  update) `→ input`; `change` dispatched once at the end if the value changed. `--clear`
  empties first. Contenteditable uses text-node append + `input`.
- `clear`: select-all + native setter `''` + `input` + `change`.
- `select <target> <option query>`: resolve `<option>` by text (fuzzy allowed) /
  `--value` / `-n` nth; set via native setter → `input` + `change`.
- `check` / `uncheck`: real `click` sequence only when the current state differs;
  verifies the resulting state in the returned row.
- `press <key>` (`-t` target, else `document.activeElement`): `keydown` (+ `keypress`
  for printable) `→ keyup` using the pure `keyInfo()` key/code map; **Enter on an input
  inside a form triggers `form.requestSubmit()`** (implicit submission, as user-event
  does — synthetic untrusted keys don't submit natively).
- `hover`: `pointerover pointerenter mouseover mouseenter pointermove mousemove`.
  `focus`: `el.focus()`.
- Every verb returns `[row]` describing what it did (ref, action, resulting value/state)
  — handle-friendly and printable.

### Listen: `on` / `off` / `events`

- `on <target> <event> [as name]`: adds a listener; subscription =
  `{ ref: 'sub1', target, event, count }` row (returned as `[row]`). Events accumulate
  in a ring buffer (100) as small summaries `{ type, ts, targetRef, key?, value?, x?, y? }`.
- `events @sub` drains + returns buffered rows (`--peek` keeps them); `off @sub` /
  `off --all` removes listeners.
- `--live` (browser best-effort): also append one line per event directly to the output
  element found via the public DOM contract `getElementById(appId + '-out')` — the
  dataHandler can't be used since it fires once per task.

### Overlay ("point at it")

`<style id="peprn-dom-style">` injected once; per-match `.peprn-dom-point` outline +
`.peprn-dom-badge` number chip; `position: fixed` from `getBoundingClientRect`,
repositioned on scroll + resize; `pointer-events: none`; high z-index;
`scrollIntoView({block:'center'})` the top match; cleared on the next `find`,
`find --clear`, or an ~8s TTL. Follows the P21 ghost split: pure `markerLayout()`
unit-tested, thin DOM applier smoke-tested.

### Help / man

Every verb gets `help.description`, option `describe`s (choices auto-documented), and
`examples` — so `man find`, `man on`, and `--help` work for free through P20/P5.

## Implementation steps

1. **Pure core first**: `types.ts`, `score.ts`, `keyInfo` in `events.ts`, `markerLayout`
   in `overlay.ts` + `test/dom.test.ts` (rank ordering, fuzzy typo cases, role
   inference, source weighting, near-proximity, key map, marker geometry). Green under
   `npm test` with no browser.
2. `candidates.ts`, `registry.ts`, `overlay.ts` DOM side, `find.ts`.
3. Act verbs in `events.ts` + their Module definitions.
4. `listen.ts` (`on`/`off`/`events`).
5. `index.ts` exports + `package.json` `"./dom"` entry + register in the browser example
   (`examples/browser/main.mjs`: `modules: { match, ...domModules }`) + add a demo form
   to `examples/browser/index.html` (labeled email input, country `<select>`,
   remember-me checkbox, submit button, a link) as the smoke target.
6. `man`/help text polish + README section (queries, verbs, handles workflow, fuzzy
   behavior, untrusted-event caveat).

## Verification

1. Gate check: rewrite green (`npm test`), P9/P13/P21/P15 present.
2. `npm test` — new pure dom specs pass in node (no DOM emulation).
3. `npm run build` (includes example bundling) → `npm run serve` → drive via
   chrome-devtools:
   - `find email` → screenshot shows badge/outline on the email input; `find sumbit`
     (typo) still points at Submit (fuzzy).
   - `type @em "hello@x.io"` → verify `input.value` via script; on the react-generator
     example, verify a controlled input's state updates (native-setter path).
   - `select country -n 3` and `select country "Icel"` → verify the selected option.
   - `check remember` → checked; `press Enter` in email → form submit handler fired.
   - `on submit click as c` → `click submit` → `events @c` prints the click row;
     `off --all`.
   - No regressions in the existing example (`match scalar …`, ghost text, `man`,
     localStorage history).

## Risks / decisions on record

- Synthetic events are `isTrusted: false`; handlers that check it won't fire (same
  limitation as testing-library). Documented, not worked around.
- Per-keystroke completion scans: mitigated by the 300ms cache + candidate cap;
  `complete()` failures are silently dropped by core, so the worst case is "no ghost",
  never a broken prompt.
- `change`-at-end-of-`type` is a pragmatic deviation from user-event's blur-only timing;
  documented.
- The registry holds strong Element refs (FIFO-capped); acceptable for a REPL page
  session.
