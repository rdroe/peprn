import * as React from 'react'
import ReactDOM from 'react-dom/client'
import { useCreateApp } from 'peprn/util'
import match from 'peprn/match'

function App() {
    useCreateApp({
        id: 'cli', modules: {
            match: match
        }
    })
    return (
        <div style={{ color: "white" }}>
            <pre id="cli-out"></pre>
            <textarea id="cli"></textarea>
        </div >
    );
}

const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement,
);

root.render(<App />)
