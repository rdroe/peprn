import type { AppHandle, AppOptions, HandleRegistryLike, TaskReport } from '../../src/core/types.js'
import { createApp } from '../../src/core/app.js'
import { createMemoryHistory } from '../../src/core/history.js'
import { fixtures } from './modules.js'

/** Inert AppHandle stub: run()/complete() reject, handles are safe no-ops. */
export function dummyApp(): AppHandle {
    const handles: HandleRegistryLike = {
        register(): void {},
        lookup(): Promise<unknown> | undefined {
            return undefined
        },
        has(): boolean {
            return false
        },
        names(): string[] {
            return []
        },
        clear(): void {},
    }

    return {
        id: 't',
        modules: {},
        handles,
        history: null,
        disposed: false,
        run(): Promise<never> {
            return Promise.reject(new Error('dummyApp cannot run'))
        },
        complete(): Promise<never> {
            return Promise.reject(new Error('dummyApp cannot run'))
        },
        dispose(): void {},
    }
}

/** Builds a real AppHandle wired to the shared fixture modules and an in-memory history. */
export async function makeTestApp(
    overrides?: Partial<AppOptions>
): Promise<{ app: AppHandle; reports: TaskReport[] }> {
    const reports: TaskReport[] = []
    const app = await createApp({
        id: 't',
        modules: fixtures,
        history: createMemoryHistory(),
        dataHandler: (r: TaskReport) => {
            reports.push(r)
        },
        ...overrides,
    })
    return { app, reports }
}
