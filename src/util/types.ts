import type { CredentialManagerSettings } from '../settings';

export type PwmSortMode =
  | 'custom'
  | 'name-asc'
  | 'name-desc'
  | 'created-asc'
  | 'created-desc'
  | 'updated-asc'
  | 'updated-desc'
  | 'expiration-asc'
  | 'expiration-desc'
  | 'deleted-asc'
  | 'deleted-desc'
  | 'item-count-asc'
  | 'item-count-desc';
export type PasswordCopyFormat = 'markdown' | 'callout';
export type PasswordUnlockMode = 'session' | 'interval' | 'always';
export type CredentialType =
  | 'login'
  | 'app-registration'
  | 'api-token'
  | 'database'
  | 'certificate'
  | 'ssh-key'
  | 'cloud-credentials'
  | 'webhook'
  | 'personal-id'
  | 'payment-card'
  | 'generic-secret';

export type CredentialData = Record<string, string>;

export interface CredentialItem {
  id: string;
  groupIds: string[];
  title: string;
  type: CredentialType;
  data: CredentialData;
  username: string;
  password: string;
  urls: string[];
  notes: string;
  expiresAt?: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  order: number;
}

export interface DeletedCredentialItem extends CredentialItem {
  deletedAt: number;
  deletedGroupNames?: string[];
}

export interface CredentialTrashData {
  items: DeletedCredentialItem[];
}

export interface CredentialGroup {
  id: string;
  name: string;
  createdAt: number;
  order: number;
}

export interface CredentialManagerViewState {
  groupSort: PwmSortMode;
  itemSort: PwmSortMode;
  lastMode: 'default' | 'trash';
  lastSelectedGroupId: string;
  lastSelectedItemId: string;
  groupColumnWidth: number;
  itemColumnWidth: number;
}

export interface EncryptedPasswordLibraryPayload {
  version: 1;
  kind: 'encrypted-library';
  encryptedAt: number;
  salt: string;
  iv: string;
  cipherText: string;
}

export interface EncryptedPasswordVerifier {
  version: 1;
  kind: 'password-verifier';
  createdAt: number;
  salt: string;
  iv: string;
  cipherText: string;
}

export interface CredentialManagerData {
  groups: CredentialGroup[];
  items: CredentialItem[];
  trash: DeletedCredentialItem[];
  view: CredentialManagerViewState;
  settings: CredentialManagerSettings;
}

export interface PwmFieldAction {
  icon: string;
  label: string;
  onClick: (input: HTMLInputElement | HTMLTextAreaElement, button: HTMLButtonElement) => void | Promise<void>;
}

export interface PwmTextFieldOptions {
  leadingIcon?: string;
}

interface CredentialManagerExportPayloadBase {
  version: 2;
  exportedAt: number;
}

export interface CredentialManagerLibraryExportPayload extends CredentialManagerExportPayloadBase {
  kind: 'library';
  data: CredentialManagerData;
}

export interface CredentialManagerCollectionExportPayload extends CredentialManagerExportPayloadBase {
  kind: 'groups' | 'items';
  data: {
    groups: CredentialGroup[];
    items: CredentialItem[];
  };
}

export type CredentialManagerExportPayload =
  | CredentialManagerLibraryExportPayload
  | CredentialManagerCollectionExportPayload;