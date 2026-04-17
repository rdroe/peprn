import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'build.js'] },
  tseslint.configs.recommended,
  {
    rules: {
      // `any` appears intentionally in module generics and callback signatures
      '@typescript-eslint/no-explicit-any': 'warn',
      // non-null assertions are used at well-guarded call sites
      '@typescript-eslint/no-non-null-assertion': 'warn',
      // debug console logging is intentional in this codebase
      'no-console': 'off',
      // prefer the TS-aware version below
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  }
)
