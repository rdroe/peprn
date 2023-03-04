
require('esbuild').build({
    external: ['node:repl'],
    entryPoints: ['./dist/testable/app.js'],
    bundle: true,
    outfile: './public/js/main.js',
    sourcemap: false,
    format: 'esm'
}).catch(() => process.exit(1))

