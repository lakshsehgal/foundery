import js from "@eslint/js";
import tseslint from "typescript-eslint";
import next from "eslint-config-next";

export default tseslint.config(
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", "data/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...next,
  {
    rules: {
      // Unused args are fine when they name a signature you have to match —
      // server actions all take a previous-state argument they ignore.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
