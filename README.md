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
