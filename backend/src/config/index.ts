import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  MOCK_DEVICES: z
    .string()
    .transform((v) => v === 'true' || v === '1')
    .default('false'),
});

const x32Schema = z.object({
  X32_HOST: z.string().optional(),
  X32_PORT: z.coerce.number().int().positive().default(10023),
});

const parsed = envSchema.parse(process.env);

export const config = {
  env: parsed.NODE_ENV,
  port: parsed.PORT,
  host: parsed.HOST,
  logLevel: parsed.LOG_LEVEL,
  mockDevices: parsed.MOCK_DEVICES,
  x32: x32Schema.parse(process.env),
} as const;

export type Config = typeof config;
