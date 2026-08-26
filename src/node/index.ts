import type { AppHandle, AppOptions, DataHandler, TaskReport } from '../core/types.js'
import { createApp } from '../core/index.js'
import { createFileHistory } from './fileHistory.js'
import { formatTaskReport, startShell } from './shell.js'

export interface NodeAppOptions extends AppOptions {
    prompt?: string
    input?: NodeJS.ReadableStream
    output?: NodeJS.WritableStream
    /** null = no history; undefined = default file-backed history */
    historyPath?: string | null
}

export interface NodeApp extends AppHandle {
    close(): void
}

const defaultDataHandler =
    (output: NodeJS.WritableStream): DataHandler =>
    (report: TaskReport) => {
        if (report.internal) return
        const text = formatTaskReport(report)
        if (text === '') return
        output.write(text + '\n')
    }

/**
 * Builds a core `AppHandle` wired to file-backed history (unless disabled via
 * `historyPath: null`) and an owned `node:readline` shell over the given
 * streams. `close()` tears down both the shell and the app.
 */
export async function createNodeApp(options: NodeAppOptions): Promise<NodeApp> {
    const { prompt, input, output, historyPath, dataHandler, completion, ...rest } = options

    const out = output ?? process.stdout
    const history = historyPath === null ? null : createFileHistory(historyPath)

    const app = await createApp({
        ...rest,
        history,
        completion,
        dataHandler: dataHandler ?? defaultDataHandler(out),
    })

    const shell = startShell(app, { prompt, input, output, completion })

    return {
        ...app,
        close(): void {
            shell.close()
            app.dispose()
        },
    }
}

export { createApp, createFileHistory }
export * from '../core/index.js'
