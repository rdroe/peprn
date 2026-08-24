import awaitAll from '../awaitAll'

describe('awaitAll', () => {
    it('resolves all promise values', async () => {
        const result = await awaitAll({ a: Promise.resolve(1), b: Promise.resolve('hello') })
        expect(result).toEqual({ a: 1, b: 'hello' })
    })

    it('handles non-promise (sync) values', async () => {
        const result = await awaitAll({ x: 42, y: 'world' })
        expect(result).toEqual({ x: 42, y: 'world' })
    })

    it('handles mixed promise and sync values', async () => {
        const result = await awaitAll({ a: Promise.resolve(1), b: 'sync' })
        expect(result).toEqual({ a: 1, b: 'sync' })
    })

    it('returns an empty object for empty input', async () => {
        const result = await awaitAll({})
        expect(result).toEqual({})
    })

    it('handles null values', async () => {
        const result = await awaitAll({ n: null })
        expect(result).toEqual({ n: null })
    })

    it('handles nested objects as sync values', async () => {
        const nested = { key: 'val' }
        const result = await awaitAll({ obj: nested })
        expect((result as { obj: typeof nested }).obj).toEqual(nested)
    })
})
