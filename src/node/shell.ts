import * as readline from 'node:readline'
import { inspect } from 'node:util'
import type { AppHandle, TaskReport } from '../core/types.js'
import { isManPage } from '../core/types.js'
import { renderManText } from '../core/man.js'

/**
 * Render a `TaskReport` for terminal output. Internal reports render empty.
 * A composite result holding a single `ManPage` value renders as manual text;
 * otherwise the composite result is inspected, prefixed with a `[handle]` or
 * `[line N]` label whenever the owning run produced more than one task.
 */
export function formatTaskReport(report: TaskReport): string {
    if (report.internal) return ''

    const { total, handle, lineIndex, status, result, error } = report

    if (status === 'ok' && result !== null) {
        const values = Object.values(result)
        if (values.length === 1 && isManPage(values[0])) {
            return renderManText(values[0])
        }
    }

    const label = total > 1 ? (handle ? `[${handle}] ` : `[line ${lineIndex + 1}] `) : ''
    const body =
        status === 'ok'
            ? inspect(result, { depth: null, colors: false, compact: 3, breakLength: 72 })
            : 'Error: ' + (error?.message ?? '')
    return label + body
}

/**
 * Builds a `node:readline`-shaped completer function backed by `app.complete`.
 * History-kind completion items are dropped; the received line is treated as
 * cursor-at-end.
 */
export function makeCompleter(
    app: AppHandle
): (line: string, cb: (err: null, result: [string[], string]) => void) => void {
    return (line, cb) => {
        void app.complete(line, line.length).then(({ items: rawItems }) => {
            const items = rawItems.filter((item) => item.kind !== 'history')
            const result: [string[], string] =
                items.length === 0
                    ? [[], '']
                    : [items.map((item) => item.value), line.slice(items[0].replaceFrom)]
            cb(null, result)
        })
    }
}

/** A trailing single UNESCAPED backslash: an odd run of `\` at the line's end. */
function hasContinuation(line: string): boolean {
    let count = 0
    for (let i = line.length - 1; i >= 0 && line[i] === '\\'; i--) count++
    return count % 2 === 1
}

/**
 * Owns a `node:readline` interface driving `app.run`. Multi-line input is
 * assembled via trailing-backslash continuation. Closing the interface
 * disposes the app; this never calls `process.exit`.
 */
export function startShell(
    app: AppHandle,
    opts: {
        prompt?: string
        input?: NodeJS.ReadableStream
        output?: NodeJS.WritableStream
        completion?: boolean
    }
): { close(): void } {
    const normalPrompt = opts.prompt ?? '> '
    const session = app.history
    const historyList = session ? [...session.entries].reverse() : []
    const useCompleter = opts.completion !== false && session !== null

    const rl = readline.createInterface({
        input: (opts.input ?? process.stdin) as NodeJS.ReadableStream,
        output: (opts.output ?? process.stdout) as NodeJS.WritableStream,
        prompt: normalPrompt,
        history: historyList,
        historySize: 200,
        ...(useCompleter ? { completer: makeCompleter(app) } : {}),
    })

    let buffer = ''

    rl.prompt()

    rl.on('line', (line: string) => {
        if (hasContinuation(line)) {
            buffer += line.slice(0, -1) + '\n'
            rl.setPrompt('... ')
            rl.prompt()
            return
        }
        const text = buffer + line
        buffer = ''
        rl.setPrompt(normalPrompt)
        void app.run(text).then(() => {
            rl.prompt()
        })
    })

    rl.on('close', () => {
        app.dispose()
    })

    return {
        close(): void {
            rl.close()
        },
    }
}
