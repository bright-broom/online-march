import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // shadcn/ui generated primitives: vendored code, keep upstream as-is.
    files: ["src/components/ui/**"],
    rules: { "react-hooks/set-state-in-effect": "off", "react-hooks/purity": "off" },
  },
  {
    // TanStack Table is not React-Compiler compatible (expected).
    files: ["src/components/dashboard/data-table.tsx"],
    rules: { "react-hooks/incompatible-library": "off" },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "drizzle/**", ".data/**"]),
]);

export default eslintConfig;
