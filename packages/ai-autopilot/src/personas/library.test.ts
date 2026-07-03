import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { personaInstructions } from './compose.js'
import { dataModeler, uiIntentDesigner, vikeAuthComposer, vikeExtensionPersonas } from './library.js'

describe('vike extension personas', () => {
  it('vikeAuthComposer teaches composing vike-auth instead of hand-rolling auth', () => {
    assert.equal(vikeAuthComposer.name, 'vike-auth-composer')
    const text = personaInstructions(vikeAuthComposer)
    // Real install + wiring, so the agent composes rather than reinventing.
    assert.match(text, /npm install vike-auth/)
    assert.match(text, /vike-auth\/react/)
    assert.match(text, /setAdapter\(createMemoryAdapter\(\)\)/)
    assert.match(text, /useUser\(\)/)
    // And it must forbid re-modeling users/sessions in the app's own ORM.
    assert.match(text, /Do NOT write auth UI/)
    assert.match(text, /do NOT model users or\s*\n?\s*sessions/i)
  })

  it('vikeExtensionPersonas keeps the ORM data persona + adds auth', () => {
    const names = vikeExtensionPersonas.map(p => p.name)
    assert.deepEqual(names, ['data-modeler', 'vike-auth-composer', 'ui-intent-designer'])
    assert.ok(vikeExtensionPersonas.includes(dataModeler))
    assert.ok(vikeExtensionPersonas.includes(uiIntentDesigner))
  })
})
