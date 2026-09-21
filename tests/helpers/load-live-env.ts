import { loadEnvConfig } from "@next/env";

// Vitest runs outside the Next.js runtime, so explicitly load the same local
// environment files for the opt-in, read-only Mainnet smoke-test boundary.
// Next intentionally excludes .env.local when NODE_ENV=test, so select its
// development env set only while loading this dedicated live-test process.
const originalNodeEnv = process.env.NODE_ENV;
Reflect.set(process.env, "NODE_ENV", "development");
try {
  loadEnvConfig(process.cwd(), true);
} finally {
  if (originalNodeEnv === undefined) {
    Reflect.deleteProperty(process.env, "NODE_ENV");
  } else {
    Reflect.set(process.env, "NODE_ENV", originalNodeEnv);
  }
}
