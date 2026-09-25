import { createId } from '../util/id';
import { decryptCredentialManagerData, isEncryptedLibraryPayload } from '../util/encryption';
import type {
  CredentialGroup,
  CredentialItem,
  CredentialManagerData,
  CredentialManagerExportPayload,
} from '../util/types';
import { normalizeImportedLibraryData, normalizeUrls } from './normalize';
import { DEFAULT_DATA } from './defaults';
import { createGroup, createItem, reindexOrders } from './credential-library-service';
import { parseImportPayload, parseMarkdownGroup, parseMarkdownItems } from './transfer';

function assertImportPayload(
  payload: CredentialManagerExportPayload,
  kind: CredentialManagerExportPayload['kind'],
): void {
  if (payload.kind !== kind) {
    throw new Error('Invalid import payload');
  }
}

function applyImportedItem(data: CredentialManagerData, groupId: string, source: Partial<CredentialItem> & { url?: unknown }, index = 0) {
  const item = createItem(data, groupId);
  item.id = createId();
  item.title = source.title || item.title;
  item.username = source.username || '';
  item.password = source.password || '';
  item.urls = normalizeUrls(source.urls ?? source.url);
  item.notes = source.notes || '';
  item.createdAt = typeof source.createdAt === 'number' ? source.createdAt : Date.now() + index;
  item.groupIds = [groupId];
  item.pinned = !!source.pinned;
  return item;
}

function parseLibraryImportData(payload: unknown): CredentialManagerData {
  if (isEncryptedLibraryPayload(payload)) {
    throw new Error('Encrypted import payload requires password');
  }

  const rawPayload = payload as Partial<CredentialManagerExportPayload> | CredentialManagerData;
  if (
    rawPayload
    && typeof rawPayload === 'object'
    && 'kind' in rawPayload
    && rawPayload.kind === 'library'
    && 'data' in rawPayload
  ) {
    const data = rawPayload.data as CredentialManagerData;
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid import payload');
    }
    return data;
  }

  if (rawPayload && typeof rawPayload === 'object' && 'groups' in rawPayload && 'items' in rawPayload) {
    return {
      groups: rawPayload.groups,
      items: rawPayload.items,
      trash: Array.isArray(rawPayload.trash) ? rawPayload.trash : structuredClone(DEFAULT_DATA.trash),
      view: typeof rawPayload.view === 'object' && rawPayload.view
        ? rawPayload.view
        : structuredClone(DEFAULT_DATA.view),
      settings: typeof rawPayload.settings === 'object' && rawPayload.settings
        ? rawPayload.settings
        : structuredClone(DEFAULT_DATA.settings),
    };
  }

  throw new Error('Invalid import payload');
}

export function isEncryptedLibraryImportText(text: string): boolean {
  try {
    return isEncryptedLibraryPayload(JSON.parse(text));
  } catch {
    return false;
  }
}

export async function importLibraryFromText(text: string, password?: string): Promise<CredentialManagerData> {
  const payload = JSON.parse(text) as unknown;
  if (isEncryptedLibraryPayload(payload)) {
    if (!password) {
      throw new Error('Missing encryption password');
    }
    const imported = normalizeImportedLibraryData(await decryptCredentialManagerData(payload, password));
    reindexOrders(imported);
    return imported;
  }

  const data = parseLibraryImportData(payload);
  const imported = normalizeImportedLibraryData(data);
  reindexOrders(imported);
  return imported;
}

export function importGroupFromText(text: string, data: CredentialManagerData): CredentialGroup {
  let groupName = '';
  let items: Partial<CredentialItem>[] = [];
  let createdAt = Date.now();

  try {
    const payload = parseImportPayload(text);
    assertImportPayload(payload, 'group');

    if (
      typeof payload.data !== 'object' ||
      !payload.data ||
      !('group' in payload.data) ||
      !('items' in payload.data)
    ) {
      throw new Error('Invalid import payload');
    }

    const source = payload.data as { group: Partial<CredentialGroup>; items: Partial<CredentialItem>[] };
    groupName = source.group.name || '';
    createdAt = typeof source.group.createdAt === 'number' ? source.group.createdAt : Date.now();
    items = source.items;
  } catch {
    const markdownGroup = parseMarkdownGroup(text);
    groupName = markdownGroup.groupName;
    items = markdownGroup.items;
  }

  const group = createGroup(data, groupName);
  group.createdAt = createdAt;

  items.forEach((sourceItem, index) => {
    applyImportedItem(data, group.id, sourceItem, index);
  });

  reindexOrders(data);
  return group;
}

export function importItemFromText(text: string, data: CredentialManagerData, groupId: string): CredentialItem {
  const imported = importItemsFromText(text, data, groupId);
  const firstImported = imported[0];
  if (!firstImported) {
    throw new Error('Invalid import payload');
  }
  return firstImported;
}

export function importItemsFromText(text: string, data: CredentialManagerData, groupId: string): CredentialItem[] {
  let sources: Partial<CredentialItem>[] = [];

  try {
    const payload = parseImportPayload(text);
    if (payload.kind === 'item') {
      sources = [payload.data as Partial<CredentialItem>];
    } else if (payload.kind === 'items') {
      const items = payload.data as Partial<CredentialItem>[];
      if (!Array.isArray(items)) {
        throw new Error('Invalid import payload');
      }
      sources = items;
    } else {
      throw new Error('Invalid import payload');
    }
  } catch {
    sources = parseMarkdownItems(text, data, groupId);
  }
  const imported = sources.map((source, index) => applyImportedItem(data, groupId, source, index));
  reindexOrders(data);
  return imported;
}