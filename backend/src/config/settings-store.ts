import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
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

/** Old project-local path — used for migration on first load with new path. */
const OLD_SETTINGS_PATH = path.resolve(__dirname, '../../data/settings.json');

/** Recursively merge `override` into `base`, only overwriting keys present in `override`. */
function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const result = { ...base };
  for (const [key, val] of Object.entries(override)) {
    if (val === undefined) continue;
    if (
      val !== null && typeof val === 'object' && !Array.isArray(val) &&
      base[key] !== null && typeof base[key] === 'object' && !Array.isArray(base[key] as Record<string, unknown>)
    ) {
      result[key] = deepMerge(base[key] as Record<string, unknown>, val as Record<string, unknown>);
    } else {
      result[key] = val;
    }
  }
  return result;
}

/** True when any device has a configured host (vs all empty defaults). */
function hasConfiguredHosts(s: AppSettings): boolean {
  return (
    s.devices.x32.host !== '' ||
    s.devices.atem.host !== '' ||
    s.devices.videohub.host !== '' ||
    s.devices.broadlink.host !== '' ||
    s.devices.outlets.tv.some((o) => o.host !== '') ||
    s.devices.outlets.amp.host !== ''
  );
}

/**
 * Resolve the settings file path:
 * 1. $SETTINGS_PATH env var
 * 2. Platform config directory (outside project tree — immune to git ops)
 * 3. Fallback to old project-local path
 */
function resolveSettingsPath(): string {
  if (config.settingsPath) {
    return config.settingsPath;
  }
  // Windows: %APPDATA%/jersey-systems/settings.json
  if (process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'jersey-systems', 'settings.json');
  }
  // Linux/Mac: $XDG_CONFIG_HOME/jersey-systems/settings.json
  //            or ~/.config/jersey-systems/settings.json
  const homeConfig = process.env.HOME
    ? path.join(process.env.HOME, '.config')
    : null;
  const configDir = process.env.XDG_CONFIG_HOME ?? homeConfig;
  if (configDir) {
    return path.join(configDir, 'jersey-systems', 'settings.json');
  }
  return OLD_SETTINGS_PATH;
}

export class SettingsStore extends EventEmitter {
  private current: AppSettings;
  private readonly settingsPath: string;

  constructor() {
    super();
    this.current = { ...DEFAULT_SETTINGS };
    this.settingsPath = resolveSettingsPath();
    logger.info('Settings store path', { path: this.settingsPath });
  }

  /** Load settings from disk (merge with defaults). */
  async load(): Promise<AppSettings> {
    try {
      const raw = await readFile(this.settingsPath, 'utf-8');
      const parsed = JSON.parse(raw);
      const validated = AppSettingsSchema.parse(parsed);
      this.current = validated;
      logger.info('Settings loaded', { path: this.settingsPath });

      // Fallback: if the new-path file has all-defaults (e.g. after a
      // corrupt-file overwrite by an older version), prefer the old path.
      if (this.settingsPath !== OLD_SETTINGS_PATH && !hasConfiguredHosts(validated)) {
        const restored = await this.tryMigrateFromOld();
        if (restored) {
          this.applyEnvOverrides();
          return this.get();
        }
      }
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;

      if (code === 'ENOENT') {
        // Try migrating from old project-local path before starting fresh
        if (this.settingsPath !== OLD_SETTINGS_PATH) {
          const migrated = await this.tryMigrateFromOld();
          if (migrated) {
            this.applyEnvOverrides();
            return this.get();
          }
        }
        // Genuinely no file anywhere — create one with defaults
        logger.info('No settings file found, using defaults');
        this.current = { ...DEFAULT_SETTINGS };
        await this.persist();
      } else {
        // File exists but is corrupt or unreadable — preserve it for
        // recovery.  Use defaults in memory so the app can still start.
        // The corrupt file will be replaced on the next successful save.
        logger.warn('Settings file corrupt, using defaults in memory (file preserved)', {
          path: this.settingsPath,
          error: (err as Error).message,
        });
        this.current = { ...DEFAULT_SETTINGS };
      }
    }

    // Env var overrides (for initial setup / Docker secrets)
    this.applyEnvOverrides();

    return this.get();
  }

  /** Get the directory containing the settings file (useful for sibling files). */
  settingsDir(): string {
    return path.dirname(this.settingsPath);
  }

  /** Get current settings (read-only snapshot). */
  get(): AppSettings {
    return structuredClone(this.current);
  }

  /** Get settings in frontend-friendly flat format. */
  getFrontend() {
    return toFrontend(this.current);
  }

  /** Merge frontend settings into current and persist. Emits 'change'. */
  async update(partial: Partial<AppSettings>): Promise<AppSettings> {
    // Deep merge: fields not present in `partial` (e.g. from an older frontend
    // build that doesn't know about newly added fields) are preserved from
    // `this.current` instead of being overwritten by schema defaults.
    const merged = deepMerge(
      this.current as Record<string, unknown>,
      partial as Record<string, unknown>,
    ) as unknown as AppSettings;

    const validated = AppSettingsSchema.parse(merged);
    this.current = validated;
    await this.persist();
    this.emit('change', this.get());
    logger.info('Settings updated');
    return this.get();
  }

  /** Persist current settings to disk (atomic write — temp file then rename). */
  private async persist(): Promise<void> {
    try {
      await mkdir(path.dirname(this.settingsPath), { recursive: true });
      const tmpPath = this.settingsPath + '.tmp';
      await writeFile(tmpPath, JSON.stringify(this.current, null, 2), 'utf-8');
      // Rename is atomic on the same filesystem.
      // On Windows we must remove the destination first.
      await rm(this.settingsPath, { force: true });
      await rename(tmpPath, this.settingsPath);
    } catch (err) {
      logger.error('Failed to write settings file', {
        error: (err as Error).message,
      });
    }
  }

  /** Try to restore settings from the old project-local path. Returns true on success. */
  private async tryMigrateFromOld(): Promise<boolean> {
    try {
      const oldRaw = await readFile(OLD_SETTINGS_PATH, 'utf-8');
      const oldParsed = JSON.parse(oldRaw);
      const oldValidated = AppSettingsSchema.parse(oldParsed);
      if (!hasConfiguredHosts(oldValidated)) {
        return false;
      }
      this.current = oldValidated;
      logger.info('Settings restored from old location', {
        from: OLD_SETTINGS_PATH,
        to: this.settingsPath,
      });
      await this.persist();
      // Remove the old project-local file so git operations can't touch it
      await rm(OLD_SETTINGS_PATH, { force: true });
      logger.info('Old settings file deleted', { path: OLD_SETTINGS_PATH });
      return true;
    } catch {
      return false;
    }
  }

  /** Fill empty settings from environment variables (do not override saved values). */
  private applyEnvOverrides(): void {
    if (config.x32.X32_HOST && !this.current.devices.x32.host) {
      this.current.devices.x32.host = config.x32.X32_HOST;
    }
    if (config.atem.ATEM_HOST && !this.current.devices.atem.host) {
      this.current.devices.atem.host = config.atem.ATEM_HOST;
    }
    if (config.videohub.VIDEOHUB_HOST && !this.current.devices.videohub.host) {
      this.current.devices.videohub.host = config.videohub.VIDEOHUB_HOST;
    }
    if (config.mockDevices) {
      this.current.mockDevices = true;
    }
  }
}
