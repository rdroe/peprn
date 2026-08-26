import * as React from 'react'
import {
    createBrowserApp,
    type AppHandle,
    type BrowserAppOptions,
    type RunOptions,
    type RunReport,
} from '../browser/index.js'

export interface UsePeprnOptions extends Omit<BrowserAppOptions, 'input' | 'output' | 'useBrowserDefault'> {}

export interface UsePeprnResult {
    inputRef: (el: HTMLTextAreaElement | null) => void
    outputRef: (el: HTMLElement | null) => void
    app: AppHandle | null
    run: (text: string, opts?: RunOptions) => Promise<RunReport>
}

export function usePeprn(options: UsePeprnOptions): UsePeprnResult {
    const [input, setInput] = React.useState<HTMLTextAreaElement | null>(null)
    const [output, setOutput] = React.useState<HTMLElement | null>(null)
    const [app, setApp] = React.useState<AppHandle | null>(null)

    // Always-latest options for the effect below, without making the effect
    // depend on (and re-fire per identity change of) the options object.
    const optionsRef = React.useRef(options)
    optionsRef.current = options

    // Always-latest app for `run`, so `run` itself can stay referentially stable.
    const appRef = React.useRef<AppHandle | null>(null)
    appRef.current = app

    const inputRef = React.useCallback((el: HTMLTextAreaElement | null) => {
        setInput(el)
    }, [])

    const outputRef = React.useCallback((el: HTMLElement | null) => {
        setOutput(el)
    }, [])

    React.useEffect(() => {
        if (!input || !output) return undefined

        let cancelled = false
        let createdApp: AppHandle | null = null

        void createBrowserApp({
            ...optionsRef.current,
            input,
            output,
            useBrowserDefault: false,
        }).then((created) => {
            if (cancelled) {
                // Unmounted (or elements changed) before creation settled.
                created.dispose()
                return
            }
            createdApp = created
            setApp(created)
        })

        return () => {
            cancelled = true
            if (createdApp) {
                createdApp.dispose()
                setApp((prev) => (prev === createdApp ? null : prev))
            }
        }
    }, [input, output])

    const run = React.useCallback((text: string, opts?: RunOptions): Promise<RunReport> => {
        const current = appRef.current
        if (!current) return Promise.reject(new Error('peprn app is not mounted yet'))
        return current.run(text, opts)
    }, [])

    return { inputRef, outputRef, app, run }
}

export interface PeprnProps {
    options: UsePeprnOptions
    className?: string
}

export function Peprn(props: PeprnProps): React.ReactElement {
    const { inputRef, outputRef } = usePeprn(props.options)
    const className = props.className ? `peprn-react ${props.className}` : 'peprn-react'

    return React.createElement(
        'div',
        { className },
        React.createElement('textarea', { ref: inputRef }),
        React.createElement('pre', { ref: outputRef }),
    )
}
