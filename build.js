const fs = require('node:fs')
const packageJson = fs.readFileSync('package.json', 'utf8')
const { devDependencies, dependencies } = JSON.parse(packageJson)
const externalizeThese = Object.keys({ ...devDependencies, ...dependencies }).includes('react') ? [] : ['react']

require('esbuild').build({
    external: ['node:repl'].concat(externalizeThese),
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

require('esbuild').build({
    external: ['node:repl'].concat(externalizeThese),
    entryPoints: ['./dist/testable/html-example.js'],
    bundle: true,
    outfile: './public/js/html-example.js',
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
