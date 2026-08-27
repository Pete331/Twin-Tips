import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";

// One config for both halves of the app, which do not share a module system:
// the server is CommonJS running in Node, the client is ES modules running in
// a browser. Linting them under one set of assumptions produces noise in both.
//
//   npm run lint       report
//   npm run lint:fix   apply what can be fixed automatically
export default [
  {
    ignores: [
      "node_modules/**",
      "client/node_modules/**",
      "client/build/**",
      "**/*.min.js",
    ],
  },

  // ---- server -------------------------------------------------------------
  {
    files: [
      "*.js",
      "config/**/*.js",
      "controllers/**/*.js",
      "middleware/**/*.js",
      "models/**/*.js",
      "routes/**/*.js",
      "scripts/**/*.js",
      "services/**/*.js",
      "utils/**/*.js",
    ],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      // args:"none" because Express hands middleware four parameters whether
      // or not the handler uses them all - an error handler must declare
      // `next` to be recognised as one, even when it never calls it.
      "no-unused-vars": ["warn", { args: "none", varsIgnorePattern: "^_" }],
    },
  },

  // ---- client -------------------------------------------------------------
  {
    files: ["client/src/**/*.{js,jsx}"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react },
    settings: { react: { version: "detect" } },
    rules: {
      ...js.configs.recommended.rules,
      // Without this a component used only in JSX looks unused, and every
      // import in the app gets flagged. This is the rule my own hand-rolled
      // detector had no idea about.
      "react/jsx-uses-vars": "error",
      // Off: the automatic JSX runtime means a file using JSX no longer has to
      // import React, so this would ask for an import that is not needed.
      "react/jsx-uses-react": "off",
      "no-unused-vars": ["warn", { args: "none", varsIgnorePattern: "^_" }],
    },
  },

  // ---- tests --------------------------------------------------------------
  {
    files: ["**/*.test.js"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];
