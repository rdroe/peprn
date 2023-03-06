import { CliApps } from "evaluator"
import { ParsedCli } from "./cliParser"

export interface Module {
    help?: ModuleHelp
    fn: (args?: ParsedCli, childCalls?: any, appId?: string, appsSingleton?: CliApps) => Promise<unknown>
    validate?: (arg: unknown) => boolean
    yargs?: {
        [optName: string]: {
            alias: string
            array?: boolean
            type?: 'string' | 'number' | 'boolean'
        }
    }
    submodules?: {
        [subcommand: string]: Module
    }
}

export type Modules = Record<string, Module>

export interface ModuleHelp {
    description: string,
    options?: object,
    examples?: object
}
