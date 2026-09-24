// How the code is laid out, decided once rather than file by file (review
// finding #26). Before this, one controller used four-space indents, single
// quotes and no semicolons, and the file beside it none of those.
//
//   npm run format         rewrite every file
//   npm run format:check   report, as CI does
//
// Prettier's defaults, which is what most of the code already looked like:
// double quotes, semicolons, two spaces, 80 columns - the width the comments
// are wrapped to. The one setting is trailing commas where ES5 allowed them
// (arrays, objects) and not in function calls, which is how the code was
// written and saves a line of churn on every multi-line call.
//
// The version is pinned exactly in package.json. Prettier's output can change
// between minor releases, and a floating version would mean a formatting diff
// arriving with an unrelated upgrade.
export default {
  trailingComma: "es5",
};
