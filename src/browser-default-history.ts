import { CliApp, CliApps, EvalInteraction } from "evaluator"

export const makeHistory = (apps: CliApps, id: string): CliApp['history'] => {
    if (!apps[id].historyData) {
        apps[id].historyData = []
    }
    return async (input: string, key: KeyboardEvent, evalResponse: EvalInteraction = 'not-called') => {
        console.log('key:', key)
        if (evalResponse === 'called') {
            apps[id].historyData.push(input)
        }

    }
}
