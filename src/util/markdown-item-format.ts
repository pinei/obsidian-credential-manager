import { PWM_TEXT } from '../lang';
import { getCredentialFieldLabel } from '../credentials/schema';
import type { PasswordCopyFormat, CredentialItem } from './types';

export interface CredentialItemMarkdownFormatOptions {
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  format: PasswordCopyFormat;
  exportBlankFields?: boolean;
  groupNames?: string[];
}

export function escapeMarkdownValue(value: string) {
  return value.replace(/\r\n/g, '\n').trim();
}

function getMarkdownFieldLabel(key: string) {
  switch (key) {
    case 'type':
      return 'Credential type';
    case 'urls':
      return PWM_TEXT.COPY_FIELD_URL;
    case 'notes':
      return PWM_TEXT.COPY_FIELD_NOTES;
    case 'expiresAt':
      return PWM_TEXT.EXPIRATION_DATE;
    case 'pinned':
      return 'Pinned';
    case 'createdAt':
      return 'Created at';
    case 'updatedAt':
      return 'Updated at';
    case 'groupTags':
      return PWM_TEXT.COPY_FIELD_GROUP_TAGS;
    default:
      return key.startsWith('data.') ? getCredentialFieldLabel(key.slice(5)) : key;
  }
}

function formatField(label: string, key: string, value: unknown, callout: boolean) {
  return `${callout ? '> ' : ''}- ${label} [${key}]: ${JSON.stringify(value)}`;
}

export function formatCredentialItemAsMarkdown(
  item: CredentialItem,
  options: CredentialItemMarkdownFormatOptions,
) {
  const { headingLevel = 3, format, exportBlankFields = true, groupNames = [] } = options;
  const headingPrefix = '#'.repeat(headingLevel);
  const title = escapeMarkdownValue(item.title) || PWM_TEXT.UNTITLED_ITEM;
  const callout = format === 'callout';
  const lines = [callout ? `> [!info] ${title}` : `${headingPrefix} ${title}`, ...(callout ? [] : [''])];
  const fields: Array<{ key: string; value: unknown; required?: boolean }> = [
    { key: 'type', value: item.type, required: true },
    ...Object.entries(item.data).map(([key, value]) => ({ key: `data.${key}`, value })),
    { key: 'urls', value: item.urls },
    { key: 'notes', value: item.notes },
    { key: 'expiresAt', value: item.expiresAt ?? '' },
    { key: 'pinned', value: item.pinned, required: true },
    { key: 'createdAt', value: item.createdAt, required: true },
    { key: 'updatedAt', value: item.updatedAt, required: true },
    { key: 'groupTags', value: groupNames },
  ];

  fields.forEach(({ key, value, required }) => {
    const hasValue = Array.isArray(value) ? value.length > 0 : value !== '' && value !== undefined;
    if (required || exportBlankFields || hasValue) {
      lines.push(formatField(getMarkdownFieldLabel(key), key, value, callout));
    }
  });

  return lines.join('\n');
}