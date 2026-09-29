import { decryptCredentialManagerData, isEncryptedLibraryPayload } from '../util/encryption';
import type {
  CredentialGroup,
  CredentialItem,
  CredentialManagerData,
  CredentialManagerExportPayload,
} from '../util/types';
import { normalizeCredentialItem, normalizeImportedLibraryData } from './normalize';
import { DEFAULT_DATA } from './defaults';
import { createGroup, reindexOrders } from './credential-library-service';
import { getMarkdownDocumentKind, parseImportPayload, parseMarkdownGroups, parseMarkdownItems } from './transfer';

function applyImportedItem(data: CredentialManagerData, groupId: string, source: Partial<CredentialItem> & { url?: unknown }, index = 0) {
  const item = normalizeCredentialItem(
    { ...source, id: undefined, groupIds: [groupId] },
    groupId,
    data.items.length + index,
    [groupId],
  );
  data.items.push(item);
  return item;
}

function parseLibraryImportData(payload: unknown): CredentialManagerData {
  if (isEncryptedLibraryPayload(payload)) {
    throw new Error('Encrypted import payload requires password');
  }

  const rawPayload = payload as Partial<CredentialManagerExportPayload>;
  if (
    rawPayload
    && typeof rawPayload === 'object'
    && 'kind' in rawPayload
    && rawPayload.kind === 'library'
    && 'data' in rawPayload
  ) {
    if (rawPayload.version !== 2) {
      throw new Error('Invalid import payload');
    }
    const parsed = parseImportPayload(JSON.stringify(rawPayload));
    if (parsed.kind !== 'library') {
      throw new Error('Invalid import payload');
    }
    const data = parsed.data;
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid import payload');
    }
    return data;
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

export async function importLibraryFromText(
  text: string,
  password?: string,
  currentData?: CredentialManagerData,
): Promise<CredentialManagerData> {
  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    if (getMarkdownDocumentKind(text) !== 'library') {
      throw new Error('Invalid import payload');
    }
    const imported: CredentialManagerData = {
      groups: [],
      items: [],
      trash: [],
      view: structuredClone(DEFAULT_DATA.view),
      settings: structuredClone(currentData?.settings ?? DEFAULT_DATA.settings),
    };
    importGroupsFromText(text, imported);
    return normalizeImportedLibraryData(imported);
  }

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

export function importGroupsFromText(text: string, data: CredentialManagerData): CredentialGroup[] {
  let sourceGroups: Partial<CredentialGroup>[] = [];
  let sourceItems: Partial<CredentialItem>[] = [];

  try {
    const payload = parseImportPayload(text);
    if (payload.kind !== 'groups') {
      throw new Error('Invalid import payload');
    }
    sourceGroups = payload.data.groups;
    sourceItems = payload.data.items;
  } catch {
    const documentKind = getMarkdownDocumentKind(text);
    if (documentKind && documentKind !== 'groups' && documentKind !== 'library') {
      throw new Error('Invalid import payload');
    }
    const markdownGroups = parseMarkdownGroups(text);
    sourceGroups = markdownGroups.map(({ groupName }, index) => ({
      id: `markdown-group-${index}`,
      name: groupName,
    }));
    sourceItems = markdownGroups.flatMap(({ items }, groupIndex) => items.map((item) => ({
      ...item,
      groupIds: (item.groupNames?.length ? item.groupNames : [markdownGroups[groupIndex]?.groupName ?? ''])
        .map((groupName) => {
          const sourceGroupIndex = markdownGroups.findIndex((group) => group.groupName === groupName);
          return sourceGroupIndex >= 0 ? `markdown-group-${sourceGroupIndex}` : '';
        })
        .filter(Boolean),
    })));
  }

  if (!sourceGroups.length) {
    throw new Error('Invalid import payload');
  }

  const groupIdMap = new Map<string, string>();
  const groups = sourceGroups.map((source, index) => {
    const group = createGroup(data, source.name || '');
    group.createdAt = typeof source.createdAt === 'number' ? source.createdAt : Date.now() + index;
    if (source.id) {
      groupIdMap.set(source.id, group.id);
    }
    return group;
  });

  sourceItems.forEach((sourceItem, index) => {
    const mappedGroupIds = (sourceItem.groupIds ?? [])
      .map((sourceGroupId) => groupIdMap.get(sourceGroupId))
      .filter((groupId): groupId is string => !!groupId);
    const targetGroupIds = mappedGroupIds.length ? mappedGroupIds : [groups[0]!.id];
    const item = applyImportedItem(data, targetGroupIds[0]!, sourceItem, index);
    item.groupIds = targetGroupIds;
  });

  reindexOrders(data);
  return groups;
}

export function importGroupFromText(text: string, data: CredentialManagerData): CredentialGroup {
  const group = importGroupsFromText(text, data)[0];
  if (!group) {
    throw new Error('Invalid import payload');
  }
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
    if (payload.kind !== 'items') {
      throw new Error('Invalid import payload');
    }
    sources = payload.data.items;
  } catch {
    const documentKind = getMarkdownDocumentKind(text);
    if (documentKind && documentKind !== 'items') {
      throw new Error('Invalid import payload');
    }
    sources = parseMarkdownItems(text, data, groupId);
  }
  const imported = sources.map((source, index) => applyImportedItem(data, groupId, source, index));
  reindexOrders(data);
  return imported;
}