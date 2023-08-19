import { Modules, Module } from './util/types'
import { CliApp } from './evaluator'

const outputSelector = (id: string) => `#${id}-out`
const elSelector = (id: string) => `#${id}`

const addDefaultCss = () => {
    const head = document.head || document.getElementsByTagName('head')[0];
    const style = document.createElement('style');
    const css =`
textarea.peprn-default {
    position: fixed;
    width: 300px;
    height: 60px;
    right: 0px;
    bottom: 0px;
    z-index: 100;
    box-sizing: border-box;
    margin-top: 0;
    margin-bottom: 0;
}

div.peprn-default-out {
    position: fixed;
    right: 0px;
    width; 400px;
    top: 0px;
    overflow-y: scroll;
    z-index: 100;
    width: 350px;
    height: calc(100% - 60px);
}

.peprn-default-out > pre {
    width: 100%;
    color: lightblue;
    margin-top: 0px;
    background-color: rgba(256,256,256,0.1);
    border-top-left-radius: 20px;
    padding-top: 10px;
    padding-bottom: 10px;
    border-bottom-left-radius: 20px;
}`;

    head.appendChild(style);
    style.type = 'text/css';
    style.appendChild(document.createTextNode(css));
}

export function conditionallyAddBrowserDefault(id: string, appsSingleton: { [id: string]: CliApp }) {


    const selector = elSelector(id);
    const dataSel = outputSelector(id);

    const body = document.body || document.getElementsByTagName('body')[0];
    if (!appsSingleton[id].el) {    
        const el = document.createElement('textarea');
    
        el.setAttribute('class', 'peprn-default')
        el.setAttribute('id', id)

        body.appendChild(el)
        appsSingleton[id].el = el
    }
    
    addDefaultCss()
    
    if (!appsSingleton[id].dataEl) {
        const dataEl = document.createElement('div');
        dataEl.setAttribute('class', 'peprn-default-out')
        dataEl.innerHTML = `
<pre id="${id}-out"></pre>
`
        body.appendChild(dataEl)
        appsSingleton[id].dataEl = document.querySelector(`#${id}-out`)
        
    }
}
