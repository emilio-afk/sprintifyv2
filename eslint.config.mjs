// eslint.config.mjs
import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-plugin-prettier";
import eslintConfigPrettier from "eslint-config-prettier";
import { defineConfig } from "eslint/config";

export default defineConfig([
  // Reglas generales del proyecto (código que corre en navegador, ESM)
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      sourceType: "module",
      globals: {
        ...globals.browser,
        // libs que cargas por CDN
        google: "readonly",
        Chart: "readonly",
        Quill: "readonly",
        confetti: "readonly",
      },
    },
    // En Flat Config, plugins es OBJETO
    plugins: { prettier },
    // Reglas recomendadas + desactiva choques de formato con Prettier
    extends: [js.configs.recommended, eslintConfigPrettier],
    rules: {
      // Hace que el formateo de Prettier sea “ley” en ESLint
      "prettier/prettier": [
        "error",
        {
          singleQuote: true,
          trailingComma: "es5",
          semi: true,
          printWidth: 100,
        },
      ],
      // Calidad práctica
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-case-declarations": "error", // obliga llaves en case con let/const
      "no-empty": ["warn", { allowEmptyCatch: true }],
    },
  },

  // Archivos de configuración (Node/CommonJS)
  {
    files: ["**/*.config.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
  },
]);
