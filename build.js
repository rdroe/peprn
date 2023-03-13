const fs = require('node:fs')
require('esbuild').build({
    external: ['node:repl'],
    entryPoints: ['./dist/testable/app.js'],
    bundle: true,
    outfile: './public/js/main.js',
    sourcemap: false,
    format: 'esm',
    platform: 'neutral',
    minify: true,
    // metafile: true
}).then((dat) => {
    console.log('dat', dat)
    if (dat.metafile) {
        fs.writeFile('dist/metafile.json', JSON.stringify(dat.metafile), (err) => {
            console.log('wrote metafile')
            console.log('error', err?.message)
        });
    }

}).catch(() => process.exit(1))

