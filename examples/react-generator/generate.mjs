#!/usr/bin/env node
// Generates a standalone react example project that consumes peprn via a
// packed tarball (no workspace symlinks). Plain node script: node:fs,
// node:path, node:readline, node:child_process only.

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as readline from 'node:readline'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')
const tarballName = 'peprn-1.0.0.tgz'

function parseArgs(argv) {
    const args = { dir: null, force: false, dryRun: false, install: true }
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--dir') {
            args.dir = argv[++i]
        } else if (a === '--force') {
            args.force = true
        } else if (a === '--dry-run') {
            args.dryRun = true
        } else if (a === '--no-install') {
            args.install = false
        }
    }
    return args
}

function promptForDir() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    return new Promise((resolve) => {
        rl.question('Target directory: ', (answer) => {
            rl.close()
            resolve(answer)
        })
    })
}

function isNonEmptyDir(dir) {
    if (!fs.existsSync(dir)) return false
    const stat = fs.statSync(dir)
    if (!stat.isDirectory()) return true
    return fs.readdirSync(dir).length > 0
}

function packageJsonFor() {
    return {
        name: 'peprn-react-example',
        version: '0.0.0',
        private: true,
        type: 'module',
        dependencies: {
            react: '^18',
            'react-dom': '^18',
            peprn: `file:${tarballName}`,
        },
        devDependencies: {
            esbuild: '^0.23.0',
        },
        scripts: {
            build: 'node build.mjs',
            serve: 'npx http-server . -p 8080 -c-1',
        },
    }
}

const INDEX_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>peprn react example</title>
</head>
<body>
<div id="root"></div>
<script type="module" src="./bundle.js"></script>
</body>
</html>
`

const MAIN_JS = `import React from 'react'
import { createRoot } from 'react-dom/client'
import { Peprn } from 'peprn/react'
import match from 'peprn/match'

const root = createRoot(document.getElementById('root'))
root.render(
    React.createElement(Peprn, { options: { id: 'cli', modules: { match } } }),
)
`

const BUILD_MJS = `import * as esbuild from 'esbuild'

await esbuild.build({
    entryPoints: ['main.js'],
    bundle: true,
    outfile: 'bundle.js',
    format: 'esm',
})
`

async function main() {
    const args = parseArgs(process.argv.slice(2))

    let rawDir = args.dir
    if (!rawDir) {
        rawDir = await promptForDir()
    }
    const dir = path.resolve(rawDir.trim())

    if (isNonEmptyDir(dir) && !args.force) {
        process.stderr.write(
            `Refusing to write into non-empty directory ${dir}; pass --force to override.\n`,
        )
        process.exit(1)
        return
    }

    const dryRun = args.dryRun

    function act(label, fn) {
        if (dryRun) {
            console.log(`DRY: ${label}`)
            return
        }
        console.log(label)
        fn()
    }

    if (!dryRun && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }

    act(`npm pack --pack-destination ${dir}`, () => {
        const res = spawnSync('npm', ['pack', '--pack-destination', dir], {
            cwd: repoRoot,
            stdio: 'inherit',
        })
        if (res.status !== 0) {
            process.stderr.write('npm pack failed\n')
            process.exit(res.status ?? 1)
        }
    })

    act(`write ${path.join(dir, 'package.json')}`, () => {
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(packageJsonFor(), null, 2) + '\n')
    })

    act(`write ${path.join(dir, 'index.html')}`, () => {
        fs.writeFileSync(path.join(dir, 'index.html'), INDEX_HTML)
    })

    act(`write ${path.join(dir, 'main.js')}`, () => {
        fs.writeFileSync(path.join(dir, 'main.js'), MAIN_JS)
    })

    act(`write ${path.join(dir, 'build.mjs')}`, () => {
        fs.writeFileSync(path.join(dir, 'build.mjs'), BUILD_MJS)
    })

    if (args.install) {
        act('npm install', () => {
            const res = spawnSync('npm', ['install'], { cwd: dir, stdio: 'inherit' })
            if (res.status !== 0) {
                process.stderr.write('npm install failed\n')
                process.exit(res.status ?? 1)
            }
        })
    }

    console.log(`Done. Next: cd ${dir} && npm run build && npm run serve (port 8080)`)
}

main()
