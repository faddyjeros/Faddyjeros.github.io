import eslintPluginAstro from "eslint-plugin-astro";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  ...tseslint.configs.recommended,
  ...eslintPluginAstro.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  { rules: { "no-console": "error" } },
  {
    // Portfolio pages parse untyped YAML — allow `any` there
    files: ["src/pages/portfolio.astro", "src/pages/portfolio/**/*.astro"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  { ignores: ["dist/**", ".astro", "public/pagefind/**"] },
];
