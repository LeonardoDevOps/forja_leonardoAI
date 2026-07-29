import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

function rulesAsWarnings(rules = {}) {
  return Object.fromEntries(
    Object.entries(rules).map(([name, setting]) => {
      if (Array.isArray(setting)) {
        const [level, ...options] = setting;
        return level === "off" || level === 0 ? [name, setting] : [name, ["warn", ...options]];
      }

      return setting === "off" || setting === 0 ? [name, setting] : [name, "warn"];
    }),
  );
}

const recommendedAsWarnings = tseslint.configs.recommended.map((config) => ({
  ...config,
  files: ["**/*.ts"],
  rules: rulesAsWarnings(config.rules),
}));

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "coverage/**",
      ".wrangler/**",
      "dist/**",
      ".forja-backup/**",
      ".forja-reports/**",
      ".forja-work/**",
      "member/**",
      "cli/**",
    ],
  },
  ...recommendedAsWarnings,
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // Test doubles emulate Cloudflare and third-party SDK objects whose complete
    // structural types are not available in Node. Keep production `any` visible
    // while allowing focused mocks to stay lightweight.
    files: ["test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  prettier,
);
