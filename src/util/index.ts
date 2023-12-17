export * from './cliParser'
export * from './types'
export * from './validation'
export { default as strlog } from './strlog'
export * from './predicates'
export { default as awaitAll } from './awaitAll'

export const PEPRN_AUTO = `peprn:automated`
export const PEPRN_AUTO_TRUE = `--${PEPRN_AUTO} true`
export const cleanHistory = (cli?: string) => cli?.replace(/[\n\s]+$/g, '') ?? ""
