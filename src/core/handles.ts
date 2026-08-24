import type { HandleRegistryLike } from './types.js'

/**
 * The `@handle` table: names -> in-flight (or settled) task promises.
 *
 * Registration is silent-overwrite (scheduler rule 5): a later `as a` replaces
 * an earlier one, and any task already holding the old promise is unaffected.
 * Handles persist across `run()` calls; `clear()` (from `dispose()`) empties it.
 *
 * `register()` attaches a no-op `.catch` to the stored promise so a handle whose
 * task rejects can never surface as an unhandled rejection, even when nothing
 * ever looks it up. Consumers still see the original promise (and its rejection)
 * from `lookup()`.
 */
export class HandleRegistry implements HandleRegistryLike {
    readonly #handles = new Map<string, Promise<unknown>>()

    register(name: string, value: Promise<unknown>): void {
        // Defuse: attaching a handler here marks the rejection as observed.
        void value.catch(() => undefined)
        this.#handles.set(name, value)
    }

    lookup(name: string): Promise<unknown> | undefined {
        return this.#handles.get(name)
    }

    has(name: string): boolean {
        return this.#handles.has(name)
    }

    /** Registration order. */
    names(): string[] {
        return [...this.#handles.keys()]
    }

    clear(): void {
        this.#handles.clear()
    }
}
