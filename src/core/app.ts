import type {
    AppHandle,
    AppOptions,
    CompletionResult,
    HistorySession,
    Modules,
    RunOptions,
    RunReport,
    TaskReport,
} from './types.js'
import { DisposedError } from './errors.js'
import { buildProgram } from './program.js'
import { runProgram } from './scheduler.js'
import type { SchedulerContext } from './scheduler.js'
import { HandleRegistry } from './handles.js'
import { createHistorySession, makeHistoryModule } from './history.js'
import { makeManModule } from './man.js'
import { complete as coreComplete } from './complete.js'

/**
 * Assemble the app's module tree: the caller's modules, plus a built-in
 * `history` command (only when a history store is configured and the caller
 * did not already define one) and a built-in `man` command (unless the
 * caller already defined one).
 */
function buildModules(options: AppOptions): Modules {
    const userModules = options.modules ?? {}
    const modules: Modules = { ...userModules }

    if (options.history && !('history' in userModules)) {
        modules.history = makeHistoryModule()
    }
    if (!('man' in userModules)) {
        modules.man = makeManModule()
    }

    return modules
}

/**
 * Build a running app: wires the shared module tree, the `@handle` registry,
 * an optional history session, and the settlement pipeline every task report
 * flows through (scheduler rules 1, 2, 11, 12, 14).
 */
export async function createApp(options: AppOptions): Promise<AppHandle> {
    const modules = buildModules(options)
    const registry = new HandleRegistry()

    // `undefined` -> no history in core (platforms supply their own default);
    // `null` -> explicitly disabled.
    const session: HistorySession | null = options.history
        ? await createHistorySession(options.history, options.id, options.historyIgnore)
        : null

    let disposed = false

    /** Rule 11 — dataHandler, then matching userEffects, then the catch hook. */
    async function onReport(report: TaskReport): Promise<void> {
        if (options.dataHandler) await options.dataHandler(report, app)

        const effects = options.userEffects ?? []
        const matching = effects.filter(
            (effect) =>
                effect.matcher === undefined ||
                (report.args !== null && effect.matcher(report.args))
        )
        await Promise.all(matching.map((effect) => effect.fn(report, app)))

        if (report.status === 'error' && options.catch) {
            options.catch(report.error as Error, report, app)
        }
    }

    const app: AppHandle = {
        id: options.id,
        modules,
        handles: registry,
        get history(): HistorySession | null {
            return session
        },
        get disposed(): boolean {
            return disposed
        },

        async run(text: string, opts: RunOptions = {}): Promise<RunReport> {
            if (disposed) throw new DisposedError(options.id)

            const internal = opts.internal ?? false

            // Rule 1 — preprocessInput runs first; `null` short-circuits everything.
            let input = text
            if (options.preprocessInput) {
                const pre = options.preprocessInput(text, app)
                if (pre === null) {
                    return { input: text, tasks: [], ok: true }
                }
                input = pre
            }

            // Rule 12 — record BEFORE execution; skipped for internal runs.
            // (ignore-prefix matching + trailing-whitespace trim live in the session)
            if (!internal && session) {
                await session.record(input.trim())
            }

            // Rule 2 — build the Program exactly once.
            const program = buildProgram(input, modules)

            const ctx: SchedulerContext = { app, registry, internal, onReport }
            return runProgram(program, ctx)
        },

        async complete(input: string, cursor: number = input.length): Promise<CompletionResult> {
            return coreComplete(
                { modules, handles: registry.names(), history: session?.entries },
                input,
                cursor
            )
        },

        dispose(): void {
            registry.clear()
            disposed = true
        },
    }

    if (options.init) await options.init(app)

    return app
}
