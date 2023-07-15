import shelljs from 'shelljs'

type ReplaceFunctionArg = (priorStdout: string) => string | Promise<string> | null

type Command = string | ReplaceFunctionArg

interface Api {
    cli: (command: string) => CliCalled
    replace: (fn: ReplaceFunctionArg) => CliCalled
    wait: (commandArg: ReplaceFunctionArg | string) => CliCalled
}

interface CliCalled extends Api {
    idx: number
    promise: Promise<void>
    isDone: boolean
    code: number | null
    stdout: string | number | null
    stderr: string | number | null
    isFirst: boolean
    commands: Command[]
}

const isPromise = <T = any>(arg: any): arg is Promise<T> => {
    return (typeof arg.then === 'function'
        && typeof arg.catch === 'function'
        && typeof arg.finally === 'function'
    )
}
const stack: CliCalled[] = []

const priorCall = (n: number) => {

    return stack.find(({ idx }, arrIdx) => {
        // dev invariant.
        if (idx !== arrIdx) {
            throw new Error(`Library error; set idx should always equal the place in the stack`)
        }
        return idx === n - 1
    })
}


// utils for accessing or awaiting stack
const priorCalls = (n: number) => {
    return stack.filter(({ idx }, arrIdx) => {
        // dev invariant.
        if (idx !== arrIdx) {
            throw new Error(`Library error; set idx should always equal the place in the stack`)
        }
        return idx < n
    })
}

const allPriorPromises = (n: number) => {
    return priorCalls(n).map(({ promise }) => promise)
}

const cliCommandFromUnknown = async (cliCalled: CliCalled, commandOrString: string | Function): Promise<string> => {

    if (typeof commandOrString === 'string') return commandOrString

    let replaceFunctionResult: string
    const prior = priorCall(cliCalled.idx)
    const directResult = commandOrString(`${prior.stdout}`)
    if (directResult === null) {
        shelljs.exec(`echo "exiting 1"`, () => {
            cliCalled.code = 1
            cliCalled.stdout = prior.stdout
            cliCalled.stderr = prior.stderr
            cliCalled.isDone = true
        })
        return ''
    }

    if (isPromise<string>(directResult)) {
        replaceFunctionResult = await directResult
    } else {
        replaceFunctionResult = directResult
    }

    return replaceFunctionResult
}

const functionInvariants = async (cliCalled: CliCalled, commands: (string | ReplaceFunctionArg)[], ownIdx: number): Promise<[string, boolean]> => {
    const commandFn = commands[0]

    if (typeof commandFn !== 'function') {
        return [`Invariant failed; for "result(...)" call. a function must be passed as argument`, false]
    }

    const prior = priorCall(ownIdx)

    await prior.promise

    if (prior.isDone !== true) {
        // dev invariant
        return [`In ".result(...) call, the prior was not finished! (prior call's data: ${prior.commands})`, false]
    }

    if (prior.code !== 0) {
        return [`Non-zero exit code on prior command: ${prior.stderr ?? prior.stdout}`, false]
    }

    if (prior.stderr) {

        return [`stderr was present on prior command: ${prior.stderr}`, false]
    }

    if (prior.stdout && prior.stderr) return [`Unknown case in which stdout and stderr both had truthy values; stdout: ${prior.stdout} ; stderr: ${prior.stderr}`, false]

    if (prior.stderr || prior.code !== 0) {
        const msg = "failing; prior command(s) call ${prior.commands} has truthy stderr or nonzero code. (Code was ${prior.code}.)"
        shelljs.exec(`echo "${msg}"`, () => {
            cliCalled.code = prior.code
            cliCalled.stdout = prior.stdout
            cliCalled.stderr = prior.stderr
            cliCalled.isDone = true
        })
        return [msg, false]
    }

    const replaceFunctionResult = await cliCommandFromUnknown(cliCalled, commands[0])

    if (typeof replaceFunctionResult !== 'string') {
        return [`A string was expected.`, false]
    }

    return [replaceFunctionResult, true]
}

function executeCommand(commands: (string | ReplaceFunctionArg)[], callType: 'cli' | 'replace' | 'wait'): CliCalled {
    const ownIdx = stack.length
    const cliCalled: CliCalled = {
        idx: ownIdx,
        promise: null,
        isDone: false,
        code: null,
        stdout: null,
        stderr: null,
        isFirst: false,
        commands,
        cli: (nextCmd: string) => {
            return executeCommand([nextCmd], 'cli')
        },
        replace: (fn) => {
            return executeCommand([fn], 'replace')
        },
        wait: (fnOrString) => {
            return executeCommand([fnOrString], 'wait')
        }
    }

    // to add a new case, add a new case here.
    // the promise needs to fill out the code, stdout, stderr, and isDone properties
    // see the NULL_EXIT remarks throughout the code on how to abort on some error / user input


    // result accepts a function argument. the function receives either a promrise for prior result or a string equating to the prior result, or null. in that final case, null, it should exit. 
    if (callType === 'replace') {
        cliCalled.promise = new Promise(async (res, rej) => {
            const [replaceFunctionResult, doRun] = await functionInvariants(cliCalled, commands, ownIdx)
            if (doRun) {
                cliCalled.commands.pop()
                cliCalled.commands.push(replaceFunctionResult)
                shelljs.exec(replaceFunctionResult, (code, stdout, stderr) => {
                    cliCalled.code = code
                    cliCalled.stdout = stdout ?? null
                    cliCalled.stderr = stderr ?? null
                    cliCalled.isDone = true
                    return res()
                })
            } else {

                return rej(replaceFunctionResult)
            }
        })

    } else if (callType === 'wait') {
        cliCalled.promise = priorCall(cliCalled.idx).promise.then(async () => {
            const cmd = await cliCommandFromUnknown(cliCalled, commands[0])
            return new Promise<void>(async (res) => {
                const prior = priorCall(ownIdx)
                await prior.promise

                shelljs.exec(cmd, (code, stdout, stderr) => {
                    cliCalled.code = code
                    cliCalled.stdout = stdout ?? null
                    cliCalled.stderr = stderr ?? null
                    cliCalled.isDone = true
                    return res()
                })

            })
        })
        // cli awaits all prior promises. its arg can only be a single string (although multi-line string seems to work ok

    } else if (callType === 'cli') {
        cliCalled.promise = new Promise(async (res, rej) => {
            const allProms = allPriorPromises(ownIdx)
            await Promise.all(allProms)
            const priorErrors = priorCalls(ownIdx).map(({ stderr, code, stdout, commands }) => {
                return code !== 0 ? (stderr ?? stdout ?? `Exiting due to failure in a prior result. The exact cause is unknown, but here is some info: ${commands.toString()} `) : null
            }).filter((result: null | string) => {
                return result !== null
            })

            if (priorErrors.length) {
                return shelljs.exec('echo "exiting 2"', (code, stdout) => {
                    cliCalled.code = code
                    cliCalled.stdout = stdout ?? null
                    cliCalled.stderr = `Aborted before ${commands[0]} ; priorErrors.join("; ")}`
                    cliCalled.isDone = true

                    return res()
                })
            } else {

                try {
                    if (typeof commands[0] === 'string') {
                        return shelljs.exec(commands[0], (code, stdout, stderr) => {
                            cliCalled.code = code
                            cliCalled.stdout = stdout ?? null
                            cliCalled.stderr = stderr ?? null
                            cliCalled.isDone = true
                            res()
                            return
                        })
                    } else throw new Error(`Non-string command to cli`)
                } catch (e) {

                    return rej(e)
                }
            }

        })
    }
    stack.push(cliCalled)
    return cliCalled
}


export function cli(command: string): CliCalled {
    return executeCommand([command], 'cli')
}

export const grn = (str: string) => `\x1b[32m${str}\x1b[0m`
export const termGreenMsg = (str: string) => console.log(`\x1b[32m${str}\x1b[0m`)

/* cli(`echo "testing shell wrapper"`).replace((result: string) => {
    return `echo "prior result started with ${result[0]}"`
}) */
