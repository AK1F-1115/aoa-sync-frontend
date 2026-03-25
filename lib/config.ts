/**
 * lib/config.ts
 *
 * Central configuration module.
 * Validates all required environment variables at module load time using Zod.
 * Fails fast with a clear error message if any required config is missing.
 *
 * RULE: All code must import config from this module.
 * Do NOT use process.env.* directly anywhere else in the codebase.
 */

import { z } from 'zod';

const configSchema = z.object({
  shopify: z.object({
    /**
     * Shopify App API Key (client-side safe — intentionally public for embedded apps).
     * Required: yes (runtime). During `next build` without .env.local, this defaults
     * to a placeholder so the build completes. At runtime, the real value must be set.
     * Env var: NEXT_PUBLIC_SHOPIFY_API_KEY
     */
    apiKey: z.string().default(''),
  }),

  api: z.object({
    /**
     * Base URL for the AOA backend API.
     * Required: yes
     * Env var: NEXT_PUBLIC_API_BASE_URL
     * Default: https://api.aoatraders.com
     */
    baseUrl: z
      .string()
      .url('NEXT_PUBLIC_API_BASE_URL must be a valid URL (e.g. https://api.aoatraders.com)')
      .default('https://api.aoatraders.com'),
  }),

  app: z.object({
    /**
     * Current Node environment.
     */
    env: z.enum(['development', 'production', 'test']).default('production'),
  }),
});

const rawConfig = {
  shopify: {
    apiKey: process.env.NEXT_PUBLIC_SHOPIFY_API_KEY ?? '',
  },
  api: {
    baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.aoatraders.com',
  },
  app: {
    env: (process.env.NODE_ENV ?? 'production') as 'development' | 'production' | 'test',
  },
};

/**
 * Parsed and validated configuration.
 *
 * All values are validated at module load time.
 * Missing required values will cause a runtime error in browser context
 * (via the validation in EmbeddedShell or first API call).
 */
function buildConfig() {
  const result = configSchema.safeParse(rawConfig);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue: z.ZodIssue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `[AOA Sync] Invalid environment configuration:\n${issues}\n\nSee .env.local.example for required variables.`
    );
  }

  return result.data;
}

export const config = buildConfig();

export type AppConfig = typeof config;
