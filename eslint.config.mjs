import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

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
    plugins: { react, "react-hooks": reactHooks },
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
      // Nothing checked the hooks until now (review finding #16), and stale
      // state from an effect reading a value it was never told about is the
      // bug this app's pages are most exposed to.
      //
      // A hook called conditionally or in a loop is simply wrong - React
      // matches hooks to state by call order - so that is an error.
      "react-hooks/rules-of-hooks": "error",
      // An error too, now that the app has none. A missing dependency is
      // usually a stale read - HomePage kept one user's tips on screen for the
      // next - and a warning only annotates a CI run it does not fail. One
      // that is genuinely deliberate gets a disable comment saying why.
      "react-hooks/exhaustive-deps": "error",
    },
  },

  // ---- tests --------------------------------------------------------------
  {
    files: ["**/*.test.js", "**/*.test.mjs"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];
