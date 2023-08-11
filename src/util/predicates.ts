import { ParsedCli } from "./cliParser"
import { ModuleHelper, Module, ModuleFn, ModuleHelp } from "./types"
export default {}

export const makeModule: ModuleHelper = (
    name,
    fn,
    submodules = [],
    help = { 'description': `Do "${name}" (needs documentation)`, examples: { "": "(Also needs examples)" } }) => {

    const module: Module = {
        help: typeof help === 'string' ? { description: help } : help,
        fn
    }
    if (submodules.length) {
        module.submodules = Object.fromEntries(submodules)
    }
    return { [name]: module }
}

export const makeSubmodule = <T extends ParsedCli = ParsedCli, R = unknown>(name: string, fn: ModuleFn<T, R>, help?: string | ModuleHelp, submodules: [string, Module][] = []) => {

    const module = makeModule(name, fn, submodules, help)
    return [name, module[name]] as [n: string, m: Module]
}
