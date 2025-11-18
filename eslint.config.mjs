import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts'
  ]),
  {
    rules: {
      'quotes': ['error', 'single'], // Las comillas simples son obligatorias
      'semi': ['error', 'never'], // No se permiten puntos y comas al final de las líneas
      'no-console': 'warn', // Advertencia al usar console.log
      'eol-last': ['error', 'always'], // Siempre debe haber una línea nueva al final del archivo
      'indent': ['error', 2], // Indentación de 2 espacios
      'comma-dangle': ['error', 'never'] // No se permiten comas al final de los objetos o arrays
      // 'no-unused-vars': 'warn', // Advertencia por variables no usadas
      // 'import/no-unresolved': 'off' // Desactivar regla de import/no-unresolved
    }
  }
])

export default eslintConfig
