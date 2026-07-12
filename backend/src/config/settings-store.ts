import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { logger } from '../logger.js';
import {
  AppSettingsSchema,
  DEFAULT_SETTINGS,
  type AppSettings,
} from './settings-schema.js';
import { config } from './index.js';
import { toFrontend } from './settings-schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Where the settings JSON lives on disk. */
const SETTINGS_PATH = path.resolve(__dirname, '../../data/settings.json');

export class SettingsStore extends EventEmitter {
  private current: AppSettings;

  constructor() {
    super();
    this.current = { ...DEFAULT_SETTINGS };
  }

  /** Load settings from disk (merge with defaults). */
  async load(): Promise<AppSettings> {
    try {
      const raw = await readFile(SETTINGS_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      const validated = AppSettingsSchema.parse(parsed);
      this.current = validated;
      logger.info('Settings loaded from disk', { path: SETTINGS_PATH });
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.info('No settings file found, using defaults');
        await this.persist();
      } else {
        logger.warn('Failed to parse settings, using defaults', {
          error: (err as Error).message,
        });
        this.current = { ...DEFAULT_SETTINGS };
        await this.persist();
      }
    }

    // Env var overrides (for initial setup / Docker secrets)
    this.applyEnvOverrides();

    return this.get();
  }

  /** Get current settings (read-only snapshot). */
  get(): AppSettings {
    return structuredClone(this.current);
  }

  /** Get settings in frontend-friendly flat format. */
  getFrontend() {
    return toFrontend(this.current);
  }

  /** Replace all settings and persist. Emits 'change'. */
  async update(partial: Partial<AppSettings>): Promise<AppSettings> {
    const merged = { ...this.current, ...partial };
    // Deep-merge devices if provided
    if (partial.devices) {
      merged.devices = {
        ...this.current.devices,
        ...partial.devices,
        outlets: partial.devices.outlets
          ? { ...this.current.devices.outlets, ...partial.devices.outlets }
          : this.current.devices.outlets,
      };
    }

    const validated = AppSettingsSchema.parse(merged);
    this.current = validated;
    await this.persist();
    this.emit('change', this.get());
    logger.info('Settings updated');
    return this.get();
  }

  /** Persist current settings to disk. */
  private async persist(): Promise<void> {
    try {
      await mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
      await writeFile(SETTINGS_PATH, JSON.stringify(this.current, null, 2), 'utf-8');
    } catch (err) {
      logger.error('Failed to write settings file', {
        error: (err as Error).message,
      });
    }
  }

  /** Override settings from environment variables. */
  private applyEnvOverrides(): void {
    if (config.x32.X32_HOST) {
      this.current.devices.x32.host = config.x32.X32_HOST;
    }
    if (config.mockDevices) {
      this.current.mockDevices = true;
    }
  }
}
