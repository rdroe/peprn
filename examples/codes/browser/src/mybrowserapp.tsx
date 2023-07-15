import * as React from 'react'
import { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { useCreateApp } from 'peprn/util'
import match from 'peprn/match'

const useUseEffect = () => {
    const [tick, setTick] = useState([0])
    useEffect(() => {
        setInterval(() => {
            tick.push(Date.now())
            setTick([...tick])
        }, 1000)
    }, [])
    return tick
}

function App() {
    const ticks = useUseEffect()
    useCreateApp({
        id: 'cli', modules: {
            match: match
        }
    })
    return (
        <div style={{ color: "white" }}><div>peprn</div>{ticks.map(t => <div key={`tick-${t}`} > {t}</div>)
        }</div >
    );
}

const root = ReactDOM.createRoot(
    document.getElementById('cli') as HTMLElement,
);

root.render(<App />)
