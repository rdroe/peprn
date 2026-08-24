/** Base class for every error peprn raises. Carries a stable machine-readable `code`. */
export class PeprnError extends Error {
    readonly code: string
    constructor(code: string, message: string, options?: { cause?: unknown }) {
        super(message, options)
        this.name = new.target.name
        this.code = code
    }
}

/** Input could not be tokenized or parsed. */
export class ParseError extends PeprnError {
    constructor(message: string, cause?: unknown) {
        super('PARSE', message, { cause })
    }
}

/** The first token matched no module in the tree. */
export class UnknownCommandError extends PeprnError {
    constructor(cmd: string) {
        super('UNKNOWN_COMMAND', `Unknown command "${cmd}"`)
    }
}

/** A task referenced an `@handle` that was never registered. */
export class UnknownHandleError extends PeprnError {
    constructor(name: string) {
        super('UNKNOWN_HANDLE', `Unknown handle "@${name}"`)
    }
}

/** A task's dependency settled as a rejection. */
export class DependencyFailedError extends PeprnError {
    constructor(name: string, cause: Error) {
        super('DEP_FAILED', `Dependency "@${name}" failed: ${cause.message}`, { cause })
    }
}

/** A resolved handle value cannot occupy the argument slot it was written into. */
export class InjectionError extends PeprnError {
    constructor(name: string, detail: string) {
        super('BAD_INJECTION', `Cannot inject @${name}: ${detail}`)
    }
}

/** The app has been disposed and can no longer run input. */
export class DisposedError extends PeprnError {
    constructor(id: string) {
        super('DISPOSED', `App "${id}" is disposed`)
    }
}
