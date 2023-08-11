const fs = require('node:fs')
require('esbuild').build({
    external: ['node:repl', 'react'], // react is a peer dependency. 
    entryPoints: ['./dist/testable/app.js'],
    bundle: true,
    outfile: './public/js/main.js',
    sourcemap: true,
    platform: 'browser',
    minify: true
}).then((dat) => {
    if (dat.metafile) {
        fs.writeFile('dist/metafile.json', JSON.stringify(dat.metafile), (err) => {
            console.log('wrote esbuild metafile')
            console.log('error', err?.message)
        });
    }

}).catch((e) => {
    process.exit(1);
})
