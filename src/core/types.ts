// ---------- scalar / token layer ----------

export type Scalar = string | number | boolean

export type Token =
    | { kind: 'word'; text: string; quoted: boolean }
    | { kind: 'ref'; name: string }

/** A `@name` reference sitting in an argument slot, awaiting injection. */
export interface RefPlaceholder { kind: 'ref'; name: string }

export const isRef = (v: unknown): v is RefPlaceholder =>
    typeof v === 'object' && v !== null &&
    (v as RefPlaceholder).kind === 'ref' && typeof (v as RefPlaceholder).name === 'string'

// ---------- parsed args ----------

export interface Args {
    /** command-path segments as typed, e.g. ['match','scalar'] */
    commands: string[]
    /** module-tree path; '$' where a wildcard matched, e.g. ['dyn','$'] */
    modulePath: string[]
    /** literal tokens consumed by '$' segments, in order */
    wildcards: string[]
    /** positional values (coerced scalars; RefPlaceholder pre-injection) */
    positional: unknown[]
    /** option values keyed by canonical option name ONLY (never alias) */
    options: Record<string, unknown>
    /** this line's text with any trailing `as <name>` removed, trimmed */
    raw: string
}

// ---------- modules ----------

export interface OptionSpec {
    alias?: string
    array?: boolean
    type?: 'string' | 'number' | 'boolean'
    /** one-line doc; powers the manual and completion detail */
    describe?: string
    /** static value completions, also documented in the manual */
    choices?: Scalar[]
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
    /**
     * RESOLVED results of every deeper fn-bearing module in the chain,
     * keyed by space-joined path, e.g. { 'match scalar': [...] }
     */
    children: Record<string, unknown>
    /** this module's own path segments, e.g. ['match'] */
    path: string[]
    /** 0 = childmost (deepest) module in the chain, increasing toward the root */
    depth: number
    app: AppHandle
}

// ---------- program ----------

export type TaskSpec =
    | {
        kind: 'task'; lineIndex: number; raw: string; tokens: Token[]
        handle: string | null; deps: string[]
    }
    | { kind: 'invalid'; lineIndex: number; raw: string; error: Error }

export interface ParsedLine {
    /** matched modules root-first */
    chain: Module[]
    /** cumulative path keys, e.g. ['match','match scalar'] */
    pathKeys: string[]
    help: 'help' | 'man' | null
    args: Args
}

export interface ParsedTask {
    spec: TaskSpec
    /** null when spec.kind === 'invalid' or parseLine threw */
    parsed: ParsedLine | null
    /** parse-stage error, if any */
    error: Error | null
}

export interface Program {
    input: string
    /** line order; empty/whitespace lines produce no task */
    tasks: ParsedTask[]
}

// ---------- reports ----------

export interface TaskReport {
    /** 0-based index in the submitted text */
    lineIndex: number
    /** task count of the owning Program */
    total: number
    /** original trimmed line including any `as name` */
    raw: string
    handle: string | null
    internal: boolean
    /** fully injected args; null if parse failed */
    args: Args | null
    status: 'ok' | 'error'
    /** composite README-shaped object, HelpOutput, or a { key: ManPage } */
    result: Record<string, unknown> | null
    error: Error | null
}

export interface RunReport {
    input: string
    /** line order */
    tasks: TaskReport[]
    /** true iff every task has status 'ok' */
    ok: boolean
}

// ---------- handlers / effects ----------

export type DataHandler = (report: TaskReport, app: AppHandle) => void | Promise<void>

export interface UserEffect {
    /** absent = always fires (even for tasks whose args are null) */
    matcher?: (args: Args) => boolean
    fn: DataHandler
}

export type KeyEffect = (ev: KeyboardEvent, app: AppHandle) => void | Promise<void>

// ---------- history ----------

export interface HistoryStore {
    load(appId: string): Promise<string[]>
    append(appId: string, entry: string): Promise<void>
    /** returns the number of entries removed */
    clear(appId: string): Promise<number>
}

export interface HistorySession {
    readonly entries: readonly string[]
    /** false = ignored, deduped, or empty */
    record(entry: string): Promise<boolean>
    /** null when already at the top */
    prev(): string | null
    /** '' when stepping just past the end; null beyond that */
    next(): string | null
    /** cursor to entries.length */
    reset(): void
    clear(): Promise<number>
}

// ---------- help (quick --help) ----------

export interface HelpNode {
    description: string
    options?: Record<string, string>
    /** keys prefixed with the full command path */
    examples?: Record<string, string>
}

export type HelpOutput = Record<string, HelpNode>

// ---------- manual ----------

export interface ManOption {
    name: string
    alias?: string
    type: 'string' | 'number' | 'boolean' | 'untyped'
    array: boolean
    describe?: string
    choices?: Scalar[]
}

export interface ManExample { cmd: string; note: string }

export interface ManPage {
    /** discriminant for platform renderers */
    kind: 'peprn:man'
    /** [] for the index page */
    path: string[]
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
    /** full replacement text for the range */
    value: string
    kind: CompletionKind
    detail?: string
    /** offset in input where replacement starts */
    replaceFrom: number
    /** offset where it ends (the cursor) */
    replaceTo: number
}

export interface CompletionResult {
    items: CompletionItem[]
    prefix: string
}

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
    /** null = disabled; undefined = platform default */
    history?: HistoryStore | null
    /** prefix list; default ['history'] */
    historyIgnore?: string[]
    /** default true; false = platforms do not wire Tab/ghost completion */
    completion?: boolean
}

export interface AppHandle {
    readonly id: string
    readonly modules: Modules
    readonly handles: HandleRegistryLike
    readonly history: HistorySession | null
    readonly disposed: boolean
    run(text: string, opts?: RunOptions): Promise<RunReport>
    /** cursor defaults to input.length */
    complete(input: string, cursor?: number): Promise<CompletionResult>
    dispose(): void
}

export interface HandleRegistryLike {
    register(name: string, value: Promise<unknown>): void
    lookup(name: string): Promise<unknown> | undefined
    has(name: string): boolean
    names(): string[]
    clear(): void
}
