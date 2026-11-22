import js from '@eslint/js'
import stylistic from '@stylistic/eslint-plugin'
import globals from 'globals'
import pluginImport from 'eslint-plugin-import-x'

export default [
  { ignores: ['dashboard/'] },
  js.configs.recommended,
  stylistic.configs.customize({
    indent: 2,
    quotes: 'single',
    semi: false,
    commaDangle: 'never',
    braceStyle: '1tbs',
    arrowParens: false
  }),
  { languageOptions: { globals: { ...globals.node, Bun: 'readonly' } } },
  pluginImport.flatConfigs.recommended,
  {
    rules: {
      '@stylistic/space-before-function-paren': ['error', 'always'],
      '@stylistic/arrow-parens': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'import-x/no-unresolved': 'off',
      'import-x/no-named-as-default-member': 'off'
    }
  }
]
