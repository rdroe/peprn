import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'

const OUT = 'examples/browser/bundle.js'

await build({
    entryPoints: ['examples/browser/main.mjs'],
    outfile: OUT,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022'
})

// Guard the 0.4.x regression where the browser entry dragged react into every bundle.
const out = await readFile(OUT, 'utf8')
if (out.includes('from "react"') || out.includes("from 'react'") || out.includes('require("react")')) {
    console.error(`react leaked into ${OUT} — the browser core must never import react`)
    process.exit(1)
}
console.log(`built ${OUT} (${out.length} bytes, react-free)`)
