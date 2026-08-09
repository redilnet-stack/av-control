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
  SETTINGS_PATH: z
    .string()
    .optional()
    .transform((v) => v || undefined),
});

const x32Schema = z.object({
  X32_HOST: z.string().optional(),
  X32_PORT: z.coerce.number().int().positive().default(10023),
});

const atemSchema = z.object({
  ATEM_HOST: z.string().optional(),
  ATEM_PORT: z.coerce.number().int().positive().default(9910),
});

const videohubSchema = z.object({
  VIDEOHUB_HOST: z.string().optional(),
  VIDEOHUB_PORT: z.coerce.number().int().positive().default(9990),
});

const parsed = envSchema.parse(process.env);

export const config = {
  env: parsed.NODE_ENV,
  port: parsed.PORT,
  host: parsed.HOST,
  logLevel: parsed.LOG_LEVEL,
  mockDevices: parsed.MOCK_DEVICES,
  settingsPath: parsed.SETTINGS_PATH,
  x32: x32Schema.parse(process.env),
  atem: atemSchema.parse(process.env),
  videohub: videohubSchema.parse(process.env),
} as const;

export type Config = typeof config;
