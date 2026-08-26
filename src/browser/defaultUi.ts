const STYLE_ID = 'peprn-default-style'

const DEFAULT_CSS = `
.peprn-default {
    display: block;
    width: 100%;
    box-sizing: border-box;
    font: 14px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    padding: 8px;
    resize: vertical;
}
.peprn-default-out {
    width: 100%;
    box-sizing: border-box;
    max-height: 320px;
    overflow: auto;
}
.peprn-default-out pre {
    margin: 0;
    font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    white-space: pre-wrap;
    word-break: break-word;
}
.peprn-ghost {
    position: absolute;
    pointer-events: none;
    white-space: pre-wrap;
    word-break: break-word;
    color: transparent;
    overflow: hidden;
    margin: 0;
    background: transparent;
}
.peprn-ghost-hint {
    color: rgba(128, 128, 128, 0.6);
}
`.trim()

/**
 * Ensures the default textarea + output <pre> (and the shared stylesheet) exist
 * in the document, creating only whatever piece is currently missing.
 */
export function ensureDefaultUi(id: string): { input: HTMLTextAreaElement; output: HTMLElement; remove(): void } {
    if (typeof document === 'undefined') {
        throw new Error('peprn: no document available to inject default UI')
    }

    let createdInput = false
    let createdOutputWrap: HTMLElement | null = null

    let input = document.getElementById(id) as HTMLTextAreaElement | null
    if (!input) {
        input = document.createElement('textarea')
        input.id = id
        input.className = 'peprn-default'
        document.body.appendChild(input)
        createdInput = true
    }

    const outId = `${id}-out`
    let output = document.getElementById(outId) as HTMLElement | null
    if (!output) {
        const wrap = document.createElement('div')
        wrap.className = 'peprn-default-out'
        output = document.createElement('pre')
        output.id = outId
        wrap.appendChild(output)
        document.body.appendChild(wrap)
        createdOutputWrap = wrap
    }

    if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement('style')
        style.id = STYLE_ID
        style.textContent = DEFAULT_CSS
        document.head.appendChild(style)
    }

    const resolvedInput = input
    const resolvedOutput = output

    return {
        input: resolvedInput,
        output: resolvedOutput,
        remove(): void {
            if (createdInput) resolvedInput.remove()
            if (createdOutputWrap) createdOutputWrap.remove()
        }
    }
}
