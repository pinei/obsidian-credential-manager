import { isCredentialType } from '../credentials/schema';
import { PWM_TEXT } from '../lang';
import { escapeMarkdownValue, formatCredentialItemAsMarkdown } from '../util/markdown-item-format';
import type {
  CredentialGroup,
  CredentialItem,
  CredentialManagerData,
  CredentialManagerExportPayload,
  PasswordCopyFormat,
} from '../util/types';

export type ParsedMarkdownItem = Partial<CredentialItem> & { groupNames?: string[] };

export interface ParsedMarkdownGroup {
  groupName: string;
  items: ParsedMarkdownItem[];
}

export function getMarkdownDocumentKind(text: string): 'library' | 'groups' | 'items' | null {
  const match = text.match(/<!--\s*credential-manager:v2\s+kind=(library|groups|items)\s*-->/);
  return match?.[1] as 'library' | 'groups' | 'items' | undefined ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isCredentialGroup(value: unknown): value is CredentialGroup {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.createdAt === 'number'
    && typeof value.order === 'number';
}

function isCredentialItem(value: unknown): value is CredentialItem {
  return isRecord(value)
    && typeof value.id === 'string'
    && Array.isArray(value.groupIds)
    && value.groupIds.every((id) => typeof id === 'string')
    && typeof value.title === 'string'
    && isCredentialType(value.type)
    && isRecord(value.data)
    && Object.values(value.data).every((entry) => typeof entry === 'string')
    && typeof value.username === 'string'
    && typeof value.password === 'string'
    && Array.isArray(value.urls)
    && value.urls.every((url) => typeof url === 'string')
    && typeof value.notes === 'string'
    && (value.expiresAt === undefined || typeof value.expiresAt === 'string')
    && typeof value.pinned === 'boolean'
    && typeof value.createdAt === 'number'
    && typeof value.updatedAt === 'number'
    && typeof value.order === 'number';
}

function isCredentialManagerData(value: unknown): value is CredentialManagerData {
  return isRecord(value)
    && Array.isArray(value.groups)
    && value.groups.every(isCredentialGroup)
    && Array.isArray(value.items)
    && value.items.every(isCredentialItem)
    && Array.isArray(value.trash)
    && isRecord(value.view)
    && isRecord(value.settings);
}

export function parseImportPayload(text: string): CredentialManagerExportPayload {
  const payload = JSON.parse(text) as unknown;
  if (!isRecord(payload) || payload.version !== 2 || typeof payload.exportedAt !== 'number') {
    throw new Error('Invalid import payload');
  }

  if (payload.kind === 'library' && isCredentialManagerData(payload.data)) {
    return payload as unknown as CredentialManagerExportPayload;
  }

  if ((payload.kind === 'groups' || payload.kind === 'items')
    && isRecord(payload.data)
    && Array.isArray(payload.data.groups)
    && payload.data.groups.every(isCredentialGroup)
    && Array.isArray(payload.data.items)
    && payload.data.items.every(isCredentialItem)) {
    return payload as unknown as CredentialManagerExportPayload;
  }

  throw new Error('Invalid import payload');
}

function createEmptyImportedItem(title: string): ParsedMarkdownItem {
  return {
    title,
    data: {},
    urls: [],
    notes: '',
    pinned: false,
  };
}

function parseMarkdownValue(rawValue: string): unknown {
  try {
    return JSON.parse(rawValue);
  } catch {
    throw new Error('Invalid markdown payload');
  }
}

function applyMarkdownField(item: ParsedMarkdownItem, key: string, value: unknown) {
  if (key === 'type' && isCredentialType(value)) {
    item.type = value;
  } else if (key.startsWith('data.') && key.length > 5 && typeof value === 'string') {
    item.data = { ...item.data, [key.slice(5)]: value };
  } else if (key === 'urls' && Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
    item.urls = value;
  } else if (key === 'notes' && typeof value === 'string') {
    item.notes = value;
  } else if (key === 'expiresAt' && typeof value === 'string') {
    item.expiresAt = value || undefined;
  } else if (key === 'pinned' && typeof value === 'boolean') {
    item.pinned = value;
  } else if (key === 'createdAt' && typeof value === 'number') {
    item.createdAt = value;
  } else if (key === 'updatedAt' && typeof value === 'number') {
    item.updatedAt = value;
  } else if (key === 'groupTags' && Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
    item.groupNames = value;
  }
}

function parseGroupedMarkdownGroups(text: string): ParsedMarkdownGroup[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n').map((line) => line.replace(/^> ?/, ''));
  const groups: ParsedMarkdownGroup[] = [];
  let currentGroup: ParsedMarkdownGroup | undefined;
  let currentItem: ParsedMarkdownItem | undefined;

  const ensureGroup = () => {
    if (!currentGroup) {
      currentGroup = { groupName: '', items: [] };
      groups.push(currentGroup);
    }
    return currentGroup;
  };

  lines.forEach((line) => {
    if (line.startsWith('## ')) {
      currentGroup = { groupName: line.slice(3).trim(), items: [] };
      groups.push(currentGroup);
      currentItem = undefined;
      return;
    }

    if (line.startsWith('### ') || line.startsWith('[!info] ')) {
      const title = line.startsWith('### ') ? line.slice(4).trim() : line.slice(8).trim();
      currentItem = createEmptyImportedItem(title);
      ensureGroup().items.push(currentItem);
      return;
    }

    if (!currentItem) {
      return;
    }

    const fieldMatch = line.match(/^-\s+.*\[([^\]]+)\]:\s*(.*)$/);
    if (fieldMatch) {
      applyMarkdownField(currentItem, fieldMatch[1] ?? '', parseMarkdownValue(fieldMatch[2] ?? ''));
    }
  });

  return groups.filter((group) => group.groupName || group.items.length);
}

export function parseMarkdownGroups(text: string): ParsedMarkdownGroup[] {
  const groups = parseGroupedMarkdownGroups(text);
  if (!groups.length || groups.some((group) => group.items.some((item) => !isCredentialType(item.type)))) {
    throw new Error('Invalid markdown payload');
  }
  return groups.map((group) => ({
    groupName: group.groupName || PWM_TEXT.IMPORT_GROUP_FALLBACK_NAME,
    items: group.items,
  }));
}

export function parseMarkdownItems(text: string, _data: CredentialManagerData, _defaultGroupId: string) {
  const items = parseGroupedMarkdownGroups(text).flatMap((group) => group.items);
  if (!items.length || items.some((item) => !isCredentialType(item.type))) {
    throw new Error('Invalid markdown payload');
  }
  return items;
}

function formatGroupedMarkdown(
  group: CredentialGroup,
  items: CredentialItem[],
  groups: CredentialGroup[],
  format: PasswordCopyFormat,
  exportBlankFields: boolean,
) {
  const blocks = [`## ${escapeMarkdownValue(group.name) || PWM_TEXT.UNTITLED_GROUP}`];
  items.forEach((item) => {
    blocks.push(formatCredentialItemAsMarkdown(item, {
      headingLevel: 3,
      format,
      exportBlankFields,
      groupNames: groups.filter(({ id }) => item.groupIds.includes(id)).map(({ name }) => name),
    }));
  });
  return blocks.join('\n\n');
}

export function formatMarkdownDocument(
  kind: 'library' | 'groups' | 'items',
  groups: CredentialGroup[],
  items: CredentialItem[],
  format: PasswordCopyFormat,
  exportBlankFields: boolean,
) {
  const remainingItems = new Map(items.map((item) => [item.id, item]));
  const blocks = [`<!-- credential-manager:v2 kind=${kind} -->`];

  groups.forEach((group) => {
    const groupItems = items.filter((item) => remainingItems.has(item.id) && item.groupIds.includes(group.id));
    blocks.push(formatGroupedMarkdown(group, groupItems, groups, format, exportBlankFields));
    groupItems.forEach(({ id }) => remainingItems.delete(id));
  });

  remainingItems.forEach((item) => {
    blocks.push(formatCredentialItemAsMarkdown(item, {
      headingLevel: 3,
      format,
      exportBlankFields,
      groupNames: groups.filter(({ id }) => item.groupIds.includes(id)).map(({ name }) => name),
    }));
  });

  return blocks.join('\n\n');
}

function isBlankExportItem(item: CredentialItem) {
  return !!item.title.trim()
    && Object.values(item.data).every((value) => !value.trim())
    && item.urls.every((url) => !url.trim())
    && !item.notes.trim()
    && !item.expiresAt;
}

export function downloadText(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = activeDocument.body.createEl('a', {
    attr: { href: url, download: filename },
  });
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadJson(filename: string, payload: CredentialManagerExportPayload) {
  downloadText(filename, JSON.stringify(payload, null, 2), 'application/json');
}

export function downloadMarkdownItems(
  filename: string,
  items: CredentialItem[],
  groups: CredentialGroup[],
  format: PasswordCopyFormat,
  exportBlankFields = true,
) {
  downloadText(filename, formatMarkdownDocument('items', groups, items, format, exportBlankFields), 'text/markdown;charset=utf-8');
}

export function downloadMarkdownGroups(
  filename: string,
  groupsWithItems: Array<{ group: CredentialGroup; items: CredentialItem[] }>,
  format: PasswordCopyFormat,
  exportBlankFields = true,
) {
  const groups = groupsWithItems.map(({ group }) => group);
  const items = [...new Map(groupsWithItems.flatMap(({ items: groupItems }) => groupItems).map((item) => [item.id, item])).values()];
  downloadText(filename, formatMarkdownDocument('groups', groups, items, format, exportBlankFields), 'text/markdown;charset=utf-8');
}

export function downloadMarkdownGroup(
  filename: string,
  group: CredentialGroup,
  items: CredentialItem[],
  format: PasswordCopyFormat,
  exportBlankFields = true,
) {
  downloadText(filename, formatMarkdownDocument('groups', [group], items, format, exportBlankFields), 'text/markdown;charset=utf-8');
}

export function exportLibraryToMarkdown(
  groups: CredentialGroup[],
  items: CredentialItem[],
  format: PasswordCopyFormat,
  exportEmptyGroups: boolean,
  exportBlankItems: boolean,
  exportBlankFields: boolean,
) {
  const exportedItems = items.filter((item) => exportBlankItems || !isBlankExportItem(item));
  const exportedGroups = groups.filter((group) => exportEmptyGroups || exportedItems.some((item) => item.groupIds.includes(group.id)));
  return formatMarkdownDocument('library', exportedGroups, exportedItems, format, exportBlankFields);
}
