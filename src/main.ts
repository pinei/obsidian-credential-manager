import { Plugin, type App } from 'obsidian';
import { CredentialStorageStore } from './data/storage-store';
import { PWM_TEXT } from './lang';
import { CredentialPluginContext } from './services/plugin-context';
import { CredentialEncryptionService } from './services/encryption-service';
import { CredentialTransferService } from './services/transfer-service';
import { createIconButton } from './services/ui-helpers';
import type { CredentialItem, CredentialManagerData, PwmSortMode } from './util/types';
import type { CredentialManagerSettings, CredentialPluginConfig } from './settings';
import { CredentialManagerModal } from './ui/credential-manager-modal';
import { CredentialManagerSettingTab } from './settings';

export default class CredentialManagerPlugin extends Plugin {
  private storageStore!: CredentialStorageStore;
  private context!: CredentialPluginContext;
  private encryptionService!: CredentialEncryptionService;
  private transferService!: CredentialTransferService;
  private readonly managerModals = new Set<CredentialManagerModal>();
  private managerOpenInFlight: Promise<void> | null = null;

  get data(): CredentialManagerData {
    return this.context.data;
  }

  get pluginConfig(): CredentialPluginConfig {
    return this.context.pluginConfig;
  }

  async onload() {
    this.initializeDependencies();
    await this.context.loadPluginData();
    this.registerEntrypoints();
    await this.transferService.syncLibraryMarkdownExport();
  }

  private initializeDependencies() {
    this.storageStore = new CredentialStorageStore(this.app);
    this.context = new CredentialPluginContext(
      this.storageStore,
      {
        loadPluginConfig: () => this.loadData(),
        savePluginConfig: (config) => this.saveData(config),
      },
    );
    this.encryptionService = new CredentialEncryptionService(this.app, this.context);
    this.transferService = new CredentialTransferService(this.app, this.context);
    this.context.setEncryptionWriteGuard(() => this.encryptionService.ensureEncryptionWriteAccess());
  }

  private registerEntrypoints() {
    this.addRibbonIcon('lock', PWM_TEXT.OPEN_MANAGER, () => {
      void this.openManager();
    });

    this.addCommand({
      id: 'open-manager',
      name: PWM_TEXT.OPEN_MANAGER,
      callback: () => {
        void this.openManager();
      },
    });

    this.addSettingTab(new CredentialManagerSettingTab(this.app, this));
  }

  async openManager() {
    const existing = this.getOpenManagerModal();
    if (existing) {
      existing.switchToMode('default');
      existing.focus();
      return;
    }

    if (this.managerOpenInFlight) {
      await this.managerOpenInFlight;
      this.getOpenManagerModal()?.focus();
      return;
    }

    this.managerOpenInFlight = this.openManagerModal('default');
    try {
      await this.managerOpenInFlight;
    } finally {
      this.managerOpenInFlight = null;
    }
  }

  async openTrash() {
    const existing = this.getOpenManagerModal();
    if (existing) {
      existing.switchToMode('trash');
      existing.focus();
      return;
    }

    if (this.managerOpenInFlight) {
      await this.managerOpenInFlight;
      const modal = this.getOpenManagerModal();
      if (modal) {
        modal.switchToMode('trash');
        modal.focus();
      }
      return;
    }

    this.managerOpenInFlight = this.openManagerModal('trash');
    try {
      await this.managerOpenInFlight;
    } finally {
      this.managerOpenInFlight = null;
    }
  }

  private getOpenManagerModal(): CredentialManagerModal | undefined {
    const next = this.managerModals.values().next();
    return next.done ? undefined : next.value;
  }

  private async openManagerModal(mode: 'default' | 'trash') {
    const allowed = await this.encryptionService.ensureEncryptionAccess();
    if (!allowed) {
      return;
    }

    const existing = this.getOpenManagerModal();
    if (existing) {
      existing.switchToMode(mode);
      existing.focus();
      return;
    }

    new CredentialManagerModal(this.app, this, { mode }).open();
  }

  openSettings() {
    const setting = (this.app as App & {
      setting: {
        open: () => void;
        openTabById: (id: string) => void;
      };
    }).setting;
    setting.open();
    setting.openTabById(this.manifest.id);
  }

  registerManagerModal(modal: CredentialManagerModal) {
    this.managerModals.add(modal);
  }

  unregisterManagerModal(modal: CredentialManagerModal) {
    this.managerModals.delete(modal);
  }

  closeManagerModals() {
    Array.from(this.managerModals).forEach((modal) => modal.close());
  }

  refreshManagerLayouts() {
    this.managerModals.forEach((modal) => modal.refreshLayout());
  }

  createIconButton(container: HTMLElement, icon: string, label: string, onClick: () => void | Promise<void>) {
    return createIconButton(container, icon, label, onClick);
  }

  async savePluginData() {
    const result = await this.context.savePluginData();
    await this.transferService.syncLibraryMarkdownExport();
    return result;
  }

  async savePluginConfig() {
    return this.context.savePluginConfig();
  }

  async applyTrashRetentionPolicy() {
    return this.context.applyTrashRetentionPolicy();
  }

  async createBackupNow() {
    return this.context.createBackupNow();
  }

  async enableEncryption() {
    return this.encryptionService.enableEncryption();
  }

  async disableEncryption() {
    return this.encryptionService.disableEncryption();
  }

  async changeEncryptionPassword() {
    return this.encryptionService.changeEncryptionPassword();
  }

  async setPersistEncryptionPassword(enabled: boolean) {
    return this.encryptionService.setPersistEncryptionPassword(enabled);
  }

  async openStorageFolder() {
    return this.encryptionService.openStorageFolder();
  }

  async ensureWriteAccess() {
    return this.encryptionService.ensureEncryptionWriteAccess();
  }

  async exportLibrary() {
    return this.transferService.exportLibrary();
  }

  async syncLibraryMarkdownExport() {
    return this.transferService.syncLibraryMarkdownExport();
  }

  async ensureLibraryMarkdownExportFile() {
    return this.transferService.ensureLibraryMarkdownExportFile();
  }

  async openLibraryMarkdownExportFile() {
    const opened = await this.transferService.openLibraryMarkdownExportFile();
    if (opened) {
      this.closeManagerModals();
    }
    return opened;
  }

  getLibraryMarkdownExportFile() {
    return this.transferService.getLibraryMarkdownExportFile();
  }

  exportGroup(groupId: string, format: 'json' | 'markdown' = 'json') {
    return this.transferService.exportGroup(groupId, format);
  }

  exportGroups(groupIds: string[], format: 'json' | 'markdown' = 'json') {
    return this.transferService.exportGroups(groupIds, format);
  }

  exportItem(itemId: string) {
    return this.transferService.exportItem(itemId);
  }

  exportItems(itemIds: string[], format: 'json' | 'markdown') {
    return this.transferService.exportItems(itemIds, format);
  }

  async importLibraryFromText(text: string) {
    return this.transferService.importLibraryFromText(text);
  }

  importGroupFromText(text: string) {
    return this.transferService.importGroupFromText(text);
  }

  importItemFromText(text: string, groupId: string) {
    return this.transferService.importItemFromText(text, groupId);
  }

  importItemsFromText(text: string, groupId: string) {
    return this.transferService.importItemsFromText(text, groupId);
  }

  updatePluginConfig(patch: Partial<CredentialPluginConfig>) {
    this.context.updatePluginConfig(patch);
  }

  updateSettings(patch: Partial<CredentialManagerSettings>) {
    this.context.updateSettings(patch);
  }

  createGroup(name?: string) {
    return this.context.createGroup(name);
  }

  updateGroupName(groupId: string, name: string) {
    return this.context.updateGroupName(groupId, name);
  }

  createItem(groupId: string, type?: import('./util/types').CredentialType) {
    return this.context.createItem(groupId, type);
  }

  duplicateItem(itemId: string) {
    return this.context.duplicateItem(itemId);
  }

  updateItemTitle(itemId: string, title: string) {
    return this.context.updateItemTitle(itemId, title);
  }

  updateItem(itemId: string, patch: Partial<Omit<CredentialItem, 'id'>>) {
    this.context.updateItem(itemId, patch);
  }

  setGroupSort(mode: PwmSortMode) {
    this.context.setGroupSort(mode);
  }

  setItemSort(mode: PwmSortMode) {
    this.context.setItemSort(mode);
  }

  deleteGroup(groupId: string) {
    return this.context.deleteGroup(groupId);
  }

  deleteGroups(groupIds: string[]) {
    return this.context.deleteGroups(groupIds);
  }

  deleteItem(itemId: string) {
    return this.context.deleteItem(itemId);
  }

  shouldDeleteItemDirectlyById(itemId: string) {
    return this.context.shouldDeleteItemDirectlyById(itemId);
  }

  deleteTrashItem(itemId: string) {
    return this.context.deleteTrashItem(itemId);
  }

  restoreTrashItem(itemId: string, groupId?: string) {
    return this.context.restoreTrashItem(itemId, groupId);
  }

  getGroup(groupId: string) {
    return this.context.getGroup(groupId);
  }

  getItem(itemId: string) {
    return this.context.getItem(itemId);
  }

  getSortedGroups() {
    return this.context.getSortedGroups();
  }

  getTrashGroups() {
    return this.context.getTrashGroups();
  }

  getItemsByGroup(groupId: string) {
    return this.context.getItemsByGroup(groupId);
  }

  getSortedItemsByGroup(groupId: string) {
    return this.context.getSortedItemsByGroup(groupId);
  }

  getTrashItemsByGroup(groupId: string) {
    return this.context.getTrashItemsByGroup(groupId);
  }

  getTrashItem(itemId: string) {
    return this.context.getTrashItem(itemId);
  }

  async copyItemAsConfiguredFormat(itemId: string) {
    return this.context.copyItemAsConfiguredFormat(itemId);
  }

  moveGroup(groupId: string, toIndex: number) {
    this.context.moveGroup(groupId, toIndex);
  }

  moveGroups(groupIds: string[], toIndex: number) {
    this.context.moveGroups(groupIds, toIndex);
  }

  moveItemWithinGroup(itemId: string, toIndex: number, groupId: string) {
    this.context.moveItemWithinGroup(itemId, toIndex, groupId);
  }

  moveItemsWithinGroup(itemIds: string[], toIndex: number, groupId: string) {
    this.context.moveItemsWithinGroup(itemIds, toIndex, groupId);
  }

  assignItemToGroup(itemId: string, groupId: string, mode: 'move' | 'add') {
    return this.context.assignItemToGroup(itemId, groupId, mode);
  }

  removeItemFromGroup(itemId: string, groupId: string) {
    return this.context.removeItemFromGroup(itemId, groupId);
  }
}