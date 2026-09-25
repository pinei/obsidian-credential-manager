import { normalizePath, type App } from 'obsidian';
import { formatDateTimeSuffix } from '../util/file-name';
import { decryptCredentialManagerData, encryptCredentialManagerData, isEncryptedLibraryPayload } from '../util/encryption';
import { downloadText } from './transfer';
import { normalizeCredentialManagerData } from './normalize';
import type {
  DeletedCredentialItem,
  EncryptedPasswordLibraryPayload,
  CredentialItem,
  CredentialManagerData,
} from '../util/types';
import type { CredentialPluginConfig } from '../settings';

const DEFAULT_STORAGE_FOLDER_NAME = '.credential';
const DATA_FILE_NAME = 'data.json';
const BACKUP_DIR_NAME = 'backup';
const AUTO_BACKUP_PREFIX = 'auto-backup';
const MANUAL_BACKUP_PREFIX = 'manual-backup';

export class CredentialStorageStore {
  constructor(private readonly app: App) {}

  getStorageFolder(config: CredentialPluginConfig) {
    return normalizePath(config.storageFolderName.trim() || DEFAULT_STORAGE_FOLDER_NAME);
  }

  getDataFilePath(config: CredentialPluginConfig) {
    return normalizePath(`${this.getStorageFolder(config)}/${DATA_FILE_NAME}`);
  }

  getAutoBackupDirPath(config: CredentialPluginConfig) {
    return normalizePath(`${this.getStorageFolder(config)}/${BACKUP_DIR_NAME}`);
  }

  getManualBackupDirPath(config: CredentialPluginConfig) {
    return normalizePath(`${this.getStorageFolder(config)}/${BACKUP_DIR_NAME}`);
  }

  async readStoredData(config: CredentialPluginConfig): Promise<unknown> {
    const adapter = this.app.vault.adapter;
    const dataFilePath = this.getDataFilePath(config);
    if (!(await adapter.exists(dataFilePath))) {
      return null;
    }

    try {
      const content = await adapter.read(dataFilePath);
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async loadData(config: CredentialPluginConfig, encryptionPassword?: string): Promise<CredentialManagerData | null> {
    const stored = await this.readStoredData(config);
    if (!stored) {
      return null;
    }

    if (isEncryptedLibraryPayload(stored)) {
      if (!encryptionPassword) {
        return null;
      }

      try {
        return normalizeCredentialManagerData(await decryptCredentialManagerData(stored, encryptionPassword));
      } catch {
        return null;
      }
    }

    return normalizeCredentialManagerData(stored);
  }

  async saveData(config: CredentialPluginConfig, data: CredentialManagerData, encryptionPassword?: string) {
    const adapter = this.app.vault.adapter;
    const storageFolder = this.getStorageFolder(config);
    const dataFilePath = this.getDataFilePath(config);
    await this.ensureDir(storageFolder);

    if (config.encryptionEnabled) {
      if (!encryptionPassword) {
        throw new Error('Missing encryption password');
      }
      const encryptedPayload = await encryptCredentialManagerData(data, encryptionPassword);
      await adapter.write(dataFilePath, JSON.stringify(encryptedPayload, null, 2));
      return;
    }

    await adapter.write(dataFilePath, JSON.stringify(data, null, 2));
  }

  async createAutoBackup(config: CredentialPluginConfig, data: CredentialManagerData, encryptionPassword?: string) {
    const backupFilePath = await this.writeBackupFile(
      config,
      data,
      this.getAutoBackupDirPath(config),
      AUTO_BACKUP_PREFIX,
      encryptionPassword,
    );
    await this.pruneBackups(config);
    return backupFilePath;
  }

  async createManualBackup(config: CredentialPluginConfig, data: CredentialManagerData, encryptionPassword?: string) {
    return this.writeBackupFile(
      config,
      data,
      this.getManualBackupDirPath(config),
      MANUAL_BACKUP_PREFIX,
      encryptionPassword,
    );
  }

  async createEncryptedManualBackup(config: CredentialPluginConfig) {
    const stored = await this.readStoredData(config);
    if (!stored || !isEncryptedLibraryPayload(stored)) {
      return null;
    }

    return this.writeRawBackupFile(this.getManualBackupDirPath(config), MANUAL_BACKUP_PREFIX, stored);
  }

  async downloadEncryptedLibrary(config: CredentialPluginConfig, filename: string) {
    const stored = await this.readStoredData(config);
    if (!stored || !isEncryptedLibraryPayload(stored)) {
      return false;
    }

    downloadText(filename, JSON.stringify(stored, null, 2), 'application/json');
    return true;
  }

  async pruneBackups(config: CredentialPluginConfig) {
    if (config.autoBackupCount === 0) {
      return;
    }

    const adapter = this.app.vault.adapter;
    const backupDirPath = this.getAutoBackupDirPath(config);
    if (!(await adapter.exists(backupDirPath))) {
      return;
    }

    const entries = await adapter.list(backupDirPath);
    const backupFiles = entries.files
      .filter((filePath) => filePath.endsWith('.json') && filePath.includes(`/${AUTO_BACKUP_PREFIX}-`))
      .sort((left, right) => this.getBackupTimestamp(left).localeCompare(this.getBackupTimestamp(right)));

    const removeCount = Math.max(0, backupFiles.length - config.autoBackupCount);
    for (const filePath of backupFiles.slice(0, removeCount)) {
      await adapter.remove(filePath);
    }
  }

  moveItemToTrash(data: CredentialManagerData, item: CredentialItem) {
    const groupNameById = new Map(data.groups.map((group) => [group.id, group.name]));
    const deletedItem: DeletedCredentialItem = {
      ...structuredClone(item),
      deletedAt: Date.now(),
      deletedGroupNames: item.groupIds.map((groupId) => groupNameById.get(groupId) || groupId),
    };
    data.trash = [deletedItem, ...data.trash.filter((entry) => entry.id !== item.id)];
    return deletedItem;
  }

  private async writeBackupFile(
    config: CredentialPluginConfig,
    data: CredentialManagerData,
    backupDirPath: string,
    filePrefix: string,
    encryptionPassword?: string,
  ) {
    const exportedAt = Date.now();

    if (config.encryptionEnabled) {
      if (!encryptionPassword) {
        throw new Error('Missing encryption password');
      }
      const encryptedPayload = await encryptCredentialManagerData(data, encryptionPassword);
      return this.writeRawBackupFile(backupDirPath, filePrefix, encryptedPayload, exportedAt);
    }

    const payload = {
      version: 1 as const,
      kind: 'library' as const,
      exportedAt,
      data,
    };
    return this.writeRawBackupFile(backupDirPath, filePrefix, payload, exportedAt);
  }

  private async writeRawBackupFile(
    backupDirPath: string,
    filePrefix: string,
    payload: EncryptedPasswordLibraryPayload | { version: 1; kind: 'library'; exportedAt: number; data: CredentialManagerData },
    exportedAt = Date.now(),
  ) {
    const adapter = this.app.vault.adapter;
    const fileSuffix = formatDateTimeSuffix(exportedAt);

    await this.ensureDir(backupDirPath);

    const backupFilePath = normalizePath(`${backupDirPath}/${filePrefix}-${fileSuffix}.json`);
    await adapter.write(backupFilePath, JSON.stringify(payload, null, 2));
    return backupFilePath;
  }

  private getBackupTimestamp(filePath: string) {
    const matched = filePath.match(/(?:auto|manual)-backup-(\d{8}-\d{6}-\d{3})\.json$/);
    return matched?.[1] ?? '';
  }

  private async ensureDir(path: string) {
    const adapter = this.app.vault.adapter;
    const parts = normalizePath(path).split('/').filter(Boolean);
    let current = '';

    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!(await adapter.exists(current))) {
        await adapter.mkdir(current);
      }
    }
  }
}