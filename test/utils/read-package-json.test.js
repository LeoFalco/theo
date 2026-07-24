// @ts-check

import test from 'node:test'
import { readPackageJSON } from '../../src/utils/read-package-json.js'
import assert from 'node:assert'

test('should read the package.json file and return tests content as a JSON object', async () => {
  const result = await readPackageJSON()
  assert.equal(result.name, 'fc-tools')
  assert.equal(result.version, '1.0.0')
  assert.equal(result.description, 'Kit com ferramentas e scripts para fluxos de trabalhos de desenvolvedores da field control')
})
