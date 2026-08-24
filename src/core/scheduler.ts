import type {
    AppHandle, Args, ParsedLine, ParsedTask, Program, RunReport, TaskReport, Token
} from './types.js'
import { isRef } from './types.js'
import { DependencyFailedError, InjectionError, UnknownCommandError, UnknownHandleError } from './errors.js'
import { childmostKey, executeChain } from './engine.js'
import { getHelp } from './help.js'
import { buildManIndex, buildManPage } from './man.js'
import type { HandleRegistry } from './handles.js'

const LIST_DETAIL = 'non-scalar value in a list position; use a single-value option slot'

const isScalar = (v: unknown): v is string | number | boolean =>
    typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'

function toError(err: unknown): Error {
    return err instanceof Error ? err : new Error(String(err))
}

/**
 * Splice resolved values into a list position (an array option's value list or
 * the positional list). A scalar is inserted at its index; an array has its
 * elements spread in place; anything else is illegal (rule 8).
 */
function injectList(list: readonly unknown[], resolved: Map<string, unknown>): unknown[] {
    const out: unknown[] = []
    for (const item of list) {
        if (!isRef(item) || !resolved.has(item.name)) {
            out.push(item)
            continue
        }
        const value = resolved.get(item.name)
        if (Array.isArray(value)) out.push(...value)
        else if (isScalar(value)) out.push(value)
        else throw new InjectionError(item.name, LIST_DETAIL)
    }
    return out
}

/**
 * Scheduler rule 8 — replace every `RefPlaceholder` with its resolved value.
 *
 * Pure: `args` is never mutated, and values are injected BY REFERENCE (never
 * re-stringified), so object identity survives into the module `fn`.
 *
 * - A non-array option slot that IS a placeholder takes the resolved value
 *   as-is, whatever its type (object, array, null, ...).
 * - Inside a list (an array option's values, or the positionals) a resolved
 *   scalar is inserted and a resolved array is spliced in; anything else throws
 *   `InjectionError`.
 *
 * A placeholder whose name is absent from `resolved` is left untouched.
 *
 * @throws InjectionError with detail
 *   `non-scalar value in a list position; use a single-value option slot`
 */
export function injectArgs(args: Args, resolved: Map<string, unknown>): Args {
    const options: Record<string, unknown> = {}

    for (const [name, value] of Object.entries(args.options)) {
        if (isRef(value)) {
            options[name] = resolved.has(value.name) ? resolved.get(value.name) : value
        } else if (Array.isArray(value)) {
            options[name] = injectList(value, resolved)
        } else {
            options[name] = value
        }
    }

    return {
        commands: args.commands,
        modulePath: args.modulePath,
        wildcards: args.wildcards,
        positional: injectList(args.positional, resolved),
        options,
        raw: args.raw
    }
}

export interface SchedulerContext {
    app: AppHandle
    registry: HandleRegistry
    internal: boolean
    /** Settlement pipeline for one task (dataHandler -> effects -> catch). */
    onReport: (report: TaskReport) => Promise<void>
}

/** What a task produced: an error, or a composite result plus its handle value. */
interface Outcome {
    args: Args | null
    result: Record<string, unknown> | null
    handleValue: unknown
    error: Error | null
}

function tokenText(tok: Token | undefined): string {
    if (tok === undefined) return ''
    return tok.kind === 'ref' ? '@' + tok.name : tok.text
}

/** Resolve this task's captured dependency promises (rule 7). */
async function resolveDeps(
    deps: readonly string[],
    captured: readonly (Promise<unknown> | undefined)[]
): Promise<Map<string, unknown>> {
    // First missing handle in `deps` order wins, before anything is awaited.
    for (let i = 0; i < deps.length; i++) {
        if (captured[i] === undefined) throw new UnknownHandleError(deps[i]!)
    }

    const settled = await Promise.allSettled(captured as Promise<unknown>[])

    // First rejected dependency in `deps` order wins.
    for (let i = 0; i < settled.length; i++) {
        const s = settled[i]!
        if (s.status === 'rejected') throw new DependencyFailedError(deps[i]!, toError(s.reason))
    }

    const resolved = new Map<string, unknown>()
    settled.forEach((s, i) => {
        if (s.status === 'fulfilled') resolved.set(deps[i]!, s.value)
    })
    return resolved
}

/** Rule 9 — help/man short-circuit, else the childmost -> root execution loop. */
async function produce(
    parsed: ParsedLine,
    args: Args,
    tokens: readonly Token[],
    ctx: SchedulerContext
): Promise<{ result: Record<string, unknown>; handleValue: unknown }> {
    if (parsed.help === 'man') {
        const key = args.commands.join(' ')
        const page = key === ''
            ? buildManIndex(ctx.app.modules, ctx.app.id)
            : buildManPage(ctx.app.modules, args.commands)
        const result: Record<string, unknown> = { [key === '' ? 'man' : key]: page }
        return { result, handleValue: result }
    }

    if (parsed.help === 'help') {
        const result: Record<string, unknown> = getHelp(ctx.app.modules, { ...parsed, args })
        return { result, handleValue: result }
    }

    if (parsed.chain.length === 0) throw new UnknownCommandError(tokenText(tokens[0]))

    const result = await executeChain(parsed, args, ctx.app)
    const key = childmostKey(parsed)
    return { result, handleValue: key === null ? undefined : result[key] }
}

/**
 * Run one task to settlement. NEVER rejects: every failure comes back as
 * `Outcome.error`, which the report renders and the handle promise re-throws.
 */
async function runTask(
    task: ParsedTask,
    captured: readonly (Promise<unknown> | undefined)[],
    gate: Promise<unknown> | null,
    ctx: SchedulerContext
): Promise<Outcome> {
    // Rule 6: a task without a handle waits for the SETTLEMENT of the previous
    // sequential task (never its success) before doing anything at all.
    if (gate !== null) await gate

    const parsed = task.parsed
    if (task.spec.kind !== 'task' || parsed === null || task.error !== null) {
        const error = task.error ?? toError(task.spec.kind === 'invalid' ? task.spec.error : 'invalid task')
        return { args: null, result: null, handleValue: undefined, error }
    }

    const deps = task.spec.deps
    let args: Args = parsed.args

    try {
        const resolved = await resolveDeps(deps, captured)
        args = injectArgs(parsed.args, resolved)
        const { result, handleValue } = await produce(parsed, args, task.spec.tokens, ctx)
        return { args, result, handleValue, error: null }
    } catch (err) {
        return { args, result: null, handleValue: undefined, error: toError(err) }
    }
}

/**
 * Rules 3-10 + 13 — schedule and run a whole Program.
 *
 * The scheduling pass is SYNCHRONOUS and in line order; per task it (a) captures
 * its dependency promises from the registry at that moment, (b) creates the task
 * promise, (c) registers its handle. That ordering is what makes forward
 * references fail, `pass @a as a` read the PREVIOUS `a`, and cycles impossible.
 *
 * Tasks with a handle block nothing; tasks without one form a sequential chain.
 * Every task yields exactly one `TaskReport`, so a failure never erases the
 * results of its siblings. This promise NEVER rejects.
 */
export function runProgram(program: Program, ctx: SchedulerContext): Promise<RunReport> {
    const total = program.tasks.length
    const reports: (TaskReport | undefined)[] = new Array<TaskReport | undefined>(total)
    const pipelines: Promise<void>[] = []

    /** Settlement of the previous sequential (handle-less) task. */
    let sequential: Promise<unknown> | null = null

    program.tasks.forEach((task, index) => {
        const spec = task.spec
        const handle = spec.kind === 'task' ? spec.handle : null
        const deps = spec.kind === 'task' ? spec.deps : []

        // (a) capture the dependency promises AS THEY STAND RIGHT NOW
        const captured = deps.map((name) => ctx.registry.lookup(name))

        // (b) create the task promise
        const outcome = runTask(task, captured, handle === null ? sequential : null, ctx)

        // (c) register the handle -- strictly after the promise was created
        if (handle !== null) {
            ctx.registry.register(handle, outcome.then((o) => {
                if (o.error !== null) throw o.error
                return o.handleValue
            }))
        } else {
            // Invalid tasks are immediately-settled members: they neither delay
            // the chain nor break it, so the gate passes straight through.
            sequential = spec.kind === 'invalid' ? sequential : outcome
        }

        pipelines.push(outcome.then(async (o) => {
            const report: TaskReport = {
                lineIndex: spec.lineIndex,
                total,
                raw: spec.raw,
                handle,
                internal: ctx.internal,
                args: o.args,
                status: o.error === null ? 'ok' : 'error',
                result: o.result,
                error: o.error
            }
            reports[index] = report
            await ctx.onReport(report)
        }))
    })

    return Promise.allSettled(pipelines).then(() => {
        const tasks = reports.filter((r): r is TaskReport => r !== undefined)
        return { input: program.input, tasks, ok: tasks.every((r) => r.status === 'ok') }
    })
}
