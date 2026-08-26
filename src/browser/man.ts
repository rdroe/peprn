import type { AppHandle, ManPage } from '../core/types.js'

/** Dash rule: a one-character name gets a single dash, anything longer gets two. */
function dashed(name: string): string {
    return name.length === 1 ? `-${name}` : `--${name}`
}

/** Renders a `ManPage` as a DOM element for the default browser data handler. */
export function renderManHtml(page: ManPage, app: AppHandle): HTMLElement {
    const root = document.createElement('div')
    root.className = 'peprn-man'

    const title = document.createElement('h3')
    title.textContent = page.title
    root.appendChild(title)

    const description = document.createElement('p')
    description.textContent = page.description
    root.appendChild(description)

    const synopsis = document.createElement('pre')
    synopsis.className = 'peprn-man-synopsis'
    synopsis.textContent = page.synopsis
    root.appendChild(synopsis)

    if (page.options.length > 0) {
        const table = document.createElement('table')
        table.className = 'peprn-man-options'
        for (const opt of page.options) {
            const row = document.createElement('tr')
            const flags = opt.alias ? `${dashed(opt.name)}, ${dashed(opt.alias)}` : dashed(opt.name)
            const type = `${opt.type}${opt.array ? '[]' : ''}`
            for (const text of [flags, type, opt.describe ?? '']) {
                const cell = document.createElement('td')
                cell.textContent = text
                row.appendChild(cell)
            }
            table.appendChild(row)
        }
        root.appendChild(table)
    }

    if (page.examples.length > 0) {
        const dl = document.createElement('dl')
        for (const example of page.examples) {
            const dt = document.createElement('dt')
            dt.textContent = example.cmd
            const dd = document.createElement('dd')
            dd.textContent = example.note
            dl.appendChild(dt)
            dl.appendChild(dd)
        }
        root.appendChild(dl)
    }

    if (page.subcommands.length > 0) {
        const ul = document.createElement('ul')
        ul.className = 'peprn-man-subcommands'
        for (const sub of page.subcommands) {
            const li = document.createElement('li')
            const link = document.createElement('a')
            link.href = '#'
            link.textContent = sub.name
            link.addEventListener('click', (ev) => {
                ev.preventDefault()
                void app.run('man ' + [...page.path, sub.name].join(' '))
            })
            li.appendChild(link)
            if (sub.description) {
                li.appendChild(document.createTextNode(' — ' + sub.description))
            }
            ul.appendChild(li)
        }
        root.appendChild(ul)
    }

    return root
}
