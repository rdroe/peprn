import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { normalize, bigrams, dice } from '../src/modules/dom/fuzzy.js'
import { inferRole } from '../src/modules/dom/roles.js'
import { parseKeySpec, keyToCode, isPrintable } from '../src/modules/dom/keys.js'
import { matchStrength, rankCandidates } from '../src/modules/dom/rank.js'
import { overlayBoxes } from '../src/modules/dom/geometry.js'
import { serializeEvent } from '../src/modules/dom/listen.js'
import type { Candidate } from '../src/modules/dom/types.js'

// Pure-layer tests only, per PLAN-dom.md's testing rule: no DOM emulation,
// no `document`/`window`. `serializeEvent` reads only plain fields off
// whatever it's handed (listen.ts's `SerializableEvent`), so a plain object
// literal exercises the exact function real listener wrappers call — no
// KeyboardEvent/PointerEvent/InputEvent construction needed.

let seq = 0
const mk = (overrides: Partial<Candidate> = {}): Candidate => {
    seq += 1
    return {
        ref: `el${seq}`,
        tag: 'div',
        role: 'generic',
        sources: {},
        visible: true,
        disabled: false,
        rect: { x: 0, y: 0, width: 100, height: 20 },
        order: seq,
        ...overrides
    }
}

describe('fuzzy', () => {
    test('normalize lowercases, trims, and collapses internal whitespace', () => {
        assert.equal(normalize('  Hello   World  '), 'hello world')
        assert.equal(normalize('Submit'), 'submit')
    })

    test('bigrams: adjacent character pairs, none for strings shorter than 2', () => {
        assert.deepEqual(bigrams('abc'), ['ab', 'bc'])
        assert.deepEqual(bigrams('a'), [])
        assert.deepEqual(bigrams(''), [])
    })

    test('dice: identity is 1', () => {
        assert.equal(dice('hello', 'hello'), 1)
        assert.equal(dice('', ''), 1)
    })

    test('dice: completely disjoint strings score 0', () => {
        assert.equal(dice('abc', 'xyz'), 0)
    })

    test("dice('submit','sbmit') is about 0.67", () => {
        const d = dice('submit', 'sbmit')
        assert.ok(Math.abs(d - 0.667) < 0.01, `expected ~0.667, got ${d}`)
    })
})

describe('roles: inferRole', () => {
    test('<button>, input[type=submit], and [role=button] all infer button', () => {
        assert.equal(inferRole('button'), 'button')
        assert.equal(inferRole('input', 'submit'), 'button')
        assert.equal(inferRole('div', undefined, 'button'), 'button')
    })

    test('explicit role attribute wins over tag-based inference', () => {
        assert.equal(inferRole('button', undefined, 'link'), 'link')
    })

    test('select infers combobox; select.type "select-multiple" infers listbox', () => {
        assert.equal(inferRole('select', 'select-one'), 'combobox')
        assert.equal(inferRole('select', 'select-multiple'), 'listbox')
    })

    test('anchors, textboxes, checkboxes/radios, headings, images, options, sliders', () => {
        assert.equal(inferRole('a'), 'link')
        assert.equal(inferRole('textarea'), 'textbox')
        assert.equal(inferRole('input'), 'textbox') // no type attr → defaults like a real <input>
        assert.equal(inferRole('input', 'text'), 'textbox')
        assert.equal(inferRole('input', 'number'), 'textbox') // pragmatic carve-out
        assert.equal(inferRole('input', 'checkbox'), 'checkbox')
        assert.equal(inferRole('input', 'radio'), 'radio')
        assert.equal(inferRole('input', 'range'), 'slider')
        assert.equal(inferRole('option'), 'option')
        assert.equal(inferRole('h1'), 'heading')
        assert.equal(inferRole('h6'), 'heading')
        assert.equal(inferRole('img'), 'img')
    })

    test('an unmatched tag falls back to generic', () => {
        assert.equal(inferRole('div'), 'generic')
    })

    test('an unrecognized role attribute is ignored, falling through to tag inference', () => {
        assert.equal(inferRole('button', undefined, 'not-a-real-role'), 'button')
    })
})

describe('keys: aliases and the "+" key', () => {
    test('Space and Esc parse to the key names real events actually carry', () => {
        // a handler branching on `e.key === ' '` / `'Escape'` must match
        assert.equal(parseKeySpec('Space').key, ' ')
        assert.equal(parseKeySpec('Space').code, 'Space')
        assert.equal(parseKeySpec('Esc').key, 'Escape')
        assert.equal(parseKeySpec('Esc').code, 'Escape')
    })

    test('canonical spellings are left alone', () => {
        assert.equal(parseKeySpec('Escape').key, 'Escape')
        assert.equal(parseKeySpec('Enter').key, 'Enter')
        assert.equal(parseKeySpec('ArrowDown').key, 'ArrowDown')
    })

    test('"+" is expressible as a key, alone and with modifiers', () => {
        assert.equal(parseKeySpec('+').key, '+')
        const ctrlPlus = parseKeySpec('Control++')
        assert.equal(ctrlPlus.key, '+')
        assert.equal(ctrlPlus.ctrlKey, true)
    })

    test('a whitespace-only spec is the space bar, not an empty key', () => {
        assert.equal(parseKeySpec(' ').key, ' ')
    })
})

describe('keys: parseKeySpec / keyToCode / isPrintable', () => {
    test("'Control+Shift+a' sets both modifier flags and codes to KeyA", () => {
        assert.deepEqual(parseKeySpec('Control+Shift+a'), {
            key: 'a',
            code: 'KeyA',
            ctrlKey: true,
            shiftKey: true,
            altKey: false,
            metaKey: false
        })
    })

    test("'Enter' alone carries no modifiers", () => {
        assert.deepEqual(parseKeySpec('Enter'), {
            key: 'Enter',
            code: 'Enter',
            ctrlKey: false,
            shiftKey: false,
            altKey: false,
            metaKey: false
        })
    })

    test('a bare digit maps to its Digit code', () => {
        assert.equal(parseKeySpec('1').code, 'Digit1')
    })

    test('keyToCode carries the named-key table used by parseKeySpec', () => {
        assert.equal(keyToCode.ArrowDown, 'ArrowDown')
        assert.equal(keyToCode.Escape, 'Escape')
    })

    test('printable detection: single characters are printable, named keys are not', () => {
        assert.equal(isPrintable('a'), true)
        assert.equal(isPrintable(' '), true)
        assert.equal(isPrintable('Enter'), false)
        assert.equal(isPrintable('Control'), false)
    })
})

describe('rank: matchStrength tiers', () => {
    test('equality, prefix, word-prefix, substring, and fuzzy tiers are ordered correctly', () => {
        assert.equal(matchStrength('submit', 'submit'), 1)
        assert.equal(matchStrength('sub', 'submit'), 0.9)
        assert.equal(matchStrength('order', 'submit order'), 0.85)
        assert.equal(matchStrength('bmi', 'submit'), 0.75)
        const fuzzy = matchStrength('sbmit', 'submit')
        assert.ok(fuzzy > 0 && fuzzy < 0.75, `expected a fuzzy tier score, got ${fuzzy}`)
    })

    test('a query with no shared bigrams and no substring relation scores 0', () => {
        assert.equal(matchStrength('zzz', 'submit'), 0)
    })

    test('an empty query is a wildcard, matching everything at full strength', () => {
        assert.equal(matchStrength('', 'anything'), 1)
    })

    test('--exact suppresses the fuzzy tier', () => {
        const loose = matchStrength('sbmit', 'submit', false)
        const exact = matchStrength('sbmit', 'submit', true)
        assert.ok(loose > 0)
        assert.equal(exact, 0)
    })

    test('extra words in a value do not dilute a typo match of one of its words', () => {
        // whole-string dice of 'sumbit' against 'submit order' is ~0.25 — under
        // the gate — while against the word 'submit' alone it clears it. The
        // longer label must not score worse than the bare word.
        const oneWord = matchStrength('sumbit', 'submit')
        const twoWords = matchStrength('sumbit', 'submit order')
        assert.ok(oneWord > 0, `expected a fuzzy match against 'submit', got ${oneWord}`)
        assert.equal(twoWords, oneWord)
    })

    test('a gate-passing fuzzy score still clears the rank threshold under the lowest source weight', () => {
        // the fuzzy band exists so the 0.34 dice gate cannot admit scores the
        // ranker would then discard; the weakest tier that matters in practice
        // is `text` (0.95).
        const strength = matchStrength('sumbit', 'submit order')
        assert.ok(strength * 0.95 >= 0.3, `expected ${strength} * 0.95 to clear the 0.3 threshold`)
    })

    test('the fuzzy tier always stays below the substring tier', () => {
        assert.ok(matchStrength('sbmit', 'submit') < 0.75)
        assert.ok(matchStrength('sumbit', 'submit order') < 0.75)
    })
})

describe('rank: proximate names and captions', () => {
    test('an inferred name never outranks a stated one', () => {
        const stated = mk({ ref: 'elStated', tag: 'button', role: 'button', sources: { text: 'Email' }, order: 1 })
        const inferred = mk({ ref: 'elInferred', tag: 'input', role: 'textbox', sources: { proximate: 'Email' }, order: 0 })
        const { matches } = rankCandidates([inferred, stated], { query: 'Email' })
        assert.equal(matches[0].ref, 'elStated')
        assert.equal(matches[0].via, 'text')
    })

    test('an inferred name still clears the threshold, so it is findable at all', () => {
        const inferred = mk({ ref: 'elInferred', tag: 'input', role: 'textbox', sources: { proximate: 'Email' } })
        const { matches, guesses } = rankCandidates([inferred], { query: 'Email' })
        assert.equal(guesses.length, 0)
        assert.equal(matches[0].ref, 'elInferred')
        assert.equal(matches[0].via, 'proximate')
    })

    test('the control beats the caption whose text named it', () => {
        // <span>Email</span><input> — the span provided the name, so the input wins
        const caption = mk({ ref: 'elCaption', tag: 'span', role: 'generic', sources: { text: 'Email' }, caption: true, order: 0 })
        const control = mk({ ref: 'elControl', tag: 'input', role: 'textbox', sources: { proximate: 'Email' }, order: 1 })
        const { matches } = rankCandidates([caption, control], { query: 'Email' })
        assert.equal(matches[0].ref, 'elControl')
    })

    test('a caption is demoted, not hidden', () => {
        const caption = mk({ ref: 'elCaption', tag: 'span', role: 'generic', sources: { text: 'Email' }, caption: true })
        const { matches } = rankCandidates([caption], { query: 'Email' })
        assert.equal(matches.length, 1)
        assert.ok(matches[0].score < 0.95, 'expected the caption to be demoted')
    })
})

describe('rank: fuzzy matching end to end', () => {
    test("a typo'd query still matches a multi-word labelled control", () => {
        const submit = mk({ ref: 'elSubmit', role: 'button', sources: { text: 'Submit order' } })
        const cancel = mk({ ref: 'elCancel', role: 'button', sources: { text: 'Cancel' } })
        const { matches, guesses } = rankCandidates([submit, cancel], { query: 'sumbit' })
        assert.equal(guesses.length, 0, 'expected a real match, not a guess list')
        assert.equal(matches[0].ref, 'elSubmit')
    })
})

describe('rank: source weighting', () => {
    test('equal match strength across sources on one candidate picks the highest-weighted source as via', () => {
        const c = mk({ sources: { label: 'foo', text: 'foo' } })
        const { matches } = rankCandidates([c], { query: 'foo' })
        assert.equal(matches[0].via, 'label')
        assert.equal(matches[0].score, 1)
    })

    test('label outranks placeholder outranks value for otherwise equal strength', () => {
        const viaValue = mk({ ref: 'elValue', sources: { value: 'foo' }, order: 2 })
        const viaPlaceholder = mk({ ref: 'elPlaceholder', sources: { placeholder: 'foo' }, order: 1 })
        const viaLabel = mk({ ref: 'elLabel', sources: { label: 'foo' }, order: 0 })
        const { matches } = rankCandidates([viaValue, viaPlaceholder, viaLabel], { query: 'foo' })
        assert.deepEqual(
            matches.map((m) => m.ref),
            ['elLabel', 'elPlaceholder', 'elValue']
        )
    })
})

describe('rank: role hard filter', () => {
    test('a role filter excludes non-matching candidates entirely, not just down-ranks them', () => {
        const btn = mk({ ref: 'elBtn', role: 'button', sources: { text: 'go' } })
        const link = mk({ ref: 'elLink', role: 'link', sources: { text: 'go' } })
        const { matches } = rankCandidates([btn, link], { query: 'go', role: 'button' })
        assert.deepEqual(
            matches.map((m) => m.ref),
            ['elBtn']
        )
    })
})

describe('rank: visibility and disabled modifiers', () => {
    test('a hidden candidate is halved, which can reorder results below a weaker visible one', () => {
        const strongHidden = mk({ ref: 'elHidden', visible: true, sources: { text: 'submit' }, order: 0 })
        strongHidden.visible = false
        const weakerVisible = mk({ ref: 'elVisible', visible: true, sources: { text: 'submitting' }, order: 1 })

        const { matches } = rankCandidates([strongHidden, weakerVisible], { query: 'submit' })
        assert.deepEqual(
            matches.map((m) => m.ref),
            ['elVisible', 'elHidden']
        )
    })
})

describe('rank: --near', () => {
    test('near flips two equally-named buttons using rect distance to the anchor', () => {
        const anchor = mk({
            ref: 'elAnchor',
            tag: 'input',
            role: 'textbox',
            sources: { label: 'Password' },
            rect: { x: 0, y: 100, width: 100, height: 20 },
            order: 0
        })
        const btnFar = mk({
            ref: 'elFar',
            tag: 'button',
            role: 'button',
            sources: { text: 'Submit' },
            rect: { x: 0, y: 0, width: 100, height: 20 },
            order: 1
        })
        const btnNear = mk({
            ref: 'elNear',
            tag: 'button',
            role: 'button',
            sources: { text: 'Submit' },
            rect: { x: 0, y: 90, width: 100, height: 20 },
            order: 2
        })

        const withoutNear = rankCandidates([btnFar, btnNear], { query: 'Submit' })
        assert.equal(withoutNear.matches[0].score, withoutNear.matches[1].score)
        assert.deepEqual(
            withoutNear.matches.map((m) => m.ref),
            ['elFar', 'elNear']
        )

        const withNear = rankCandidates([anchor, btnFar, btnNear], { query: 'Submit', near: 'Password' })
        assert.deepEqual(
            withNear.matches.map((m) => m.ref),
            ['elNear', 'elFar']
        )
    })

    test('near still works when --role would have filtered the anchor out of the pool', () => {
        // the anchor is a textbox; the role filter keeps only buttons. Resolving
        // the anchor inside the filtered pool would make --near silently inert.
        const anchor = mk({ ref: 'elAnchor', tag: 'input', role: 'textbox', sources: { label: 'Password' }, rect: { x: 0, y: 100, width: 100, height: 20 }, order: 0 })
        const btnFar = mk({ ref: 'elFar', tag: 'button', role: 'button', sources: { text: 'Submit' }, rect: { x: 0, y: 0, width: 100, height: 20 }, order: 1 })
        const btnNear = mk({ ref: 'elNear', tag: 'button', role: 'button', sources: { text: 'Submit' }, rect: { x: 0, y: 90, width: 100, height: 20 }, order: 2 })

        const { matches } = rankCandidates([anchor, btnFar, btnNear], { query: 'Submit', role: 'button', near: 'Password' })
        assert.deepEqual(
            matches.map((m) => m.ref),
            ['elNear', 'elFar']
        )
    })

    test('an anchor that matches nothing is ignored rather than anchoring on document order', () => {
        const btnFar = mk({ ref: 'elFar', tag: 'button', role: 'button', sources: { text: 'Submit' }, rect: { x: 0, y: 0, width: 100, height: 20 }, order: 0 })
        const btnNear = mk({ ref: 'elNear', tag: 'button', role: 'button', sources: { text: 'Submit' }, rect: { x: 0, y: 90, width: 100, height: 20 }, order: 1 })

        const plain = rankCandidates([btnFar, btnNear], { query: 'Submit' })
        const bogus = rankCandidates([btnFar, btnNear], { query: 'Submit', near: 'qqqqqqqqqq' })
        assert.deepEqual(
            bogus.matches.map((m) => m.ref),
            plain.matches.map((m) => m.ref)
        )
        assert.deepEqual(
            bogus.matches.map((m) => m.score),
            plain.matches.map((m) => m.score)
        )
    })
})

describe('rank: nth', () => {
    test('nth picks the Nth ranked survivor and keeps its requested position as its nth', () => {
        const a = mk({ ref: 'elA', sources: { text: 'foo' }, order: 0 })
        const b = mk({ ref: 'elB', sources: { text: 'foo' }, order: 1 })
        const c = mk({ ref: 'elC', sources: { text: 'foo' }, order: 2 })
        const { matches } = rankCandidates([a, b, c], { query: 'foo', nth: 2 })
        assert.equal(matches.length, 1)
        assert.equal(matches[0].ref, 'elB')
        assert.equal(matches[0].nth, 2)
    })

    test('nth beyond the survivor count returns no matches, falling back to guesses', () => {
        const a = mk({ ref: 'elA', sources: { text: 'foo' } })
        const { matches, guesses } = rankCandidates([a], { query: 'foo', nth: 5 })
        assert.deepEqual(matches, [])
        assert.equal(guesses.length, 1)
    })
})

describe('rank: empty outcome', () => {
    test('when nothing survives the threshold, guesses carries up to 3 closest candidates', () => {
        const cands = [
            mk({ ref: 'el1', sources: { text: 'Submit' }, order: 0 }),
            mk({ ref: 'el2', sources: { text: 'Cancel' }, order: 1 }),
            mk({ ref: 'el3', sources: { text: 'Delete' }, order: 2 }),
            mk({ ref: 'el4', sources: { text: 'Save' }, order: 3 })
        ]
        const { matches, guesses } = rankCandidates(cands, { query: 'zzzzzzzzzz' })
        assert.deepEqual(matches, [])
        assert.equal(guesses.length, 3)
    })
})

describe('rank: tie-break', () => {
    test('equal scores break on document order', () => {
        const a = mk({ ref: 'elA', sources: { text: 'foo' }, order: 5 })
        const b = mk({ ref: 'elB', sources: { text: 'foo' }, order: 2 })
        const { matches } = rankCandidates([a, b], { query: 'foo' })
        assert.deepEqual(
            matches.map((m) => m.ref),
            ['elB', 'elA']
        )
    })
})

describe('geometry: overlayBoxes', () => {
    test('badge position stays clamped inside the viewport for offscreen rects', () => {
        const viewport = { width: 400, height: 300 }
        const boxes = overlayBoxes(
            [
                { ref: 'elNegative', nth: 1, rect: { x: -50, y: -50, width: 40, height: 20 } },
                { ref: 'elBeyond', nth: 2, rect: { x: 390, y: 290, width: 40, height: 20 } }
            ],
            viewport
        )
        for (const box of boxes) {
            assert.ok(box.badge.x >= 0 && box.badge.x <= viewport.width - 18)
            assert.ok(box.badge.y >= 0 && box.badge.y <= viewport.height - 18)
        }
    })

    test('the outline box pads a couple pixels around the element rect', () => {
        const boxes = overlayBoxes(
            [{ ref: 'el1', nth: 1, rect: { x: 10, y: 10, width: 50, height: 20 } }],
            { width: 800, height: 600 }
        )
        assert.deepEqual(boxes[0].outline, { x: 8, y: 8, width: 54, height: 24 })
    })
})

describe('listen: serializeEvent', () => {
    test('keyboard combo: modifier flags join with the key, in Control/Shift/Alt/Meta order', () => {
        const row = serializeEvent({ type: 'keydown', timeStamp: 1000, key: 'Enter', ctrlKey: true })
        assert.equal(row.type, 'keydown')
        assert.equal(row.summary, 'Control+Enter')

        const multi = serializeEvent({ type: 'keydown', timeStamp: 1000, key: 'a', ctrlKey: true, shiftKey: true })
        assert.equal(multi.summary, 'Control+Shift+a')

        const bare = serializeEvent({ type: 'keyup', timeStamp: 1000, key: 'Tab' })
        assert.equal(bare.summary, 'Tab')
    })

    test('input value truncation: target.value over 40ch is cut to 40 and ellipsized; short values pass through untouched', () => {
        const long = 'x'.repeat(50)
        const row = serializeEvent({ type: 'input', timeStamp: 0, target: { value: long } })
        assert.equal(row.type, 'input')
        assert.equal(row.summary, `${'x'.repeat(40)}…`)
        assert.equal(row.summary.length, 41)

        const short = serializeEvent({ type: 'change', timeStamp: 0, target: { value: 'hello' } })
        assert.equal(short.summary, 'hello')

        const missing = serializeEvent({ type: 'input', timeStamp: 0, target: null })
        assert.equal(missing.summary, '')
    })

    test('pointer coords: "button=N @ x,y", client coords rounded to whole pixels', () => {
        const row = serializeEvent({ type: 'pointerdown', timeStamp: 0, button: 0, clientX: 120.4, clientY: 45.6 })
        assert.equal(row.type, 'pointerdown')
        assert.equal(row.summary, 'button=0 @ 120,46')

        const click = serializeEvent({ type: 'click', timeStamp: 0, button: 2, clientX: 10, clientY: 20 })
        assert.equal(click.summary, 'button=2 @ 10,20')
    })

    test('an event type outside the keyboard/pointer/input sets falls back to its bare type name', () => {
        const row = serializeEvent({ type: 'submit', timeStamp: 0 })
        assert.equal(row.summary, 'submit')
    })

    test('ts is derived from the event\'s own timeStamp, rounded — deterministic, no wall-clock read', () => {
        const row = serializeEvent({ type: 'focus', timeStamp: 1234.6 })
        assert.equal(row.ts, 1235)
    })
})
