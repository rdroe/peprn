import { isNumber, allNum, allToNum, passivelyParsed, isNode } from '../validation'

describe('isNumber', () => {
    it('returns true for an integer string', () => expect(isNumber('42')).toBe(true))
    it('returns true for a float string', () => expect(isNumber('3.14')).toBe(true))
    it('returns true for a negative integer', () => expect(isNumber('-5')).toBe(true))
    it('returns true for a negative float', () => expect(isNumber('-3.14')).toBe(true))
    it('returns true for zero', () => expect(isNumber('0')).toBe(true))
    it('returns false for an alphabetic string', () => expect(isNumber('hello')).toBe(false))
    it('returns false for an empty string', () => expect(isNumber('')).toBe(false))
    it('returns false for alphanumeric', () => expect(isNumber('12abc')).toBe(false))
    it('returns false for a bare decimal point', () => expect(isNumber('.')).toBe(false))
})

describe('allNum', () => {
    it('returns true when all elements are numeric strings', () => {
        expect(allNum(['1', '2', '3'])).toBe(true)
    })
    it('returns false when any element is non-numeric', () => {
        expect(allNum(['1', 'two', '3'])).toBe(false)
    })
    it('returns false when any element is undefined', () => {
        expect(allNum([undefined, '1'])).toBe(false)
    })
    it('returns true for an empty array', () => {
        expect(allNum([])).toBe(true)
    })
    it('returns true for a single numeric string', () => {
        expect(allNum(['99'])).toBe(true)
    })
})

describe('allToNum', () => {
    it('converts numeric strings to numbers', () => {
        expect(allToNum(['1', '2.5', '-3'])).toEqual([1, 2.5, -3])
    })
    it('returns an empty array for empty input', () => {
        expect(allToNum([])).toEqual([])
    })
    it('throws for non-numeric input', () => {
        expect(() => allToNum(['not-a-number'])).toThrow()
    })
})

describe('passivelyParsed', () => {
    it('returns parsed JSON for a valid JSON string', () => {
        const result = passivelyParsed('{"a":1}')
        expect(result).toMatchObject({ success: true })
    })
    it('returns the raw string when JSON parsing is not applicable', () => {
        const result = passivelyParsed('hello')
        expect(result).toBe('hello')
    })
    it('handles null JSON literal', () => {
        const result = passivelyParsed('null')
        expect(result).toMatchObject({ success: true })
    })
    it('handles true JSON literal', () => {
        const result = passivelyParsed('true')
        expect(result).toMatchObject({ success: true })
    })
})

describe('isNode', () => {
    it('returns true in a Node.js environment', () => {
        expect(isNode()).toBe(true)
    })
})
