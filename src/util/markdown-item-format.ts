import { PWM_TEXT } from '../lang';
import type { PasswordCopyFormat, CredentialItem } from './types';

export interface CredentialItemMarkdownFormatOptions {
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  format: PasswordCopyFormat;
  exportBlankFields?: boolean;
}

export function escapeMarkdownValue(value: string) {
  return value.replace(/\r\n/g, '\n').trim();
}

function wrapInlineCode(value: string) {
  const normalized = escapeMarkdownValue(value);
  return normalized ? `\`${normalized}\`` : '';
}
function wrapMarkdownLink(value: string) {
  const normalized = escapeMarkdownValue(value);
  return normalized ? `<${normalized}>` : '';
}

function getItemUrls(item: Pick<CredentialItem, 'urls'> & { url?: string }) {
  return item.urls.length ? item.urls : (item.url ? [item.url] : []);
}

function formatMarkdownUrls(item: Pick<CredentialItem, 'urls'> & { url?: string }) {
  const urls = getItemUrls(item);
  if (!urls.length) {
    return '';
  }
  if (urls.length === 1) {
    return wrapMarkdownLink(urls[0] ?? '');
  }
  return `\n${urls.map((url) => `    - ${wrapMarkdownLink(url)}`).join('\n')}`;
}

function formatCalloutUrls(item: Pick<CredentialItem, 'urls'> & { url?: string }) {
  const urls = getItemUrls(item);
  if (!urls.length) {
    return '';
  }
  if (urls.length === 1) {
    return wrapMarkdownLink(urls[0] ?? '');
  }
  return `\n${urls.map((url) => `>   - ${wrapMarkdownLink(url)}`).join('\n')}`;
}

function formatMarkdownIndentedValue(value: string) {
  const normalized = escapeMarkdownValue(value);
  if (!normalized) {
    return '';
  }

  return `\n${normalized.split('\n').map((line) => `    ${line}`).join('\n')}`;
}

function formatCalloutIndentedValue(value: string) {
  const normalized = escapeMarkdownValue(value);
  if (!normalized) {
    return '';
  }

  return `\n${normalized.split('\n').map((line) => `>     ${line}`).join('\n')}`;
}

export function getMarkdownFieldLabel(key: 'username' | 'password' | 'url' | 'notes' | 'expiration') {
  switch (key) {
    case 'username':
      return PWM_TEXT.COPY_FIELD_USERNAME;
    case 'password':
      return PWM_TEXT.COPY_FIELD_PASSWORD;
    case 'url':
      return PWM_TEXT.COPY_FIELD_URL;
    case 'notes':
      return PWM_TEXT.COPY_FIELD_NOTES;
    case 'expiration':
      return PWM_TEXT.EXPIRATION_DATE;
    default:
      return '';
  }
}

export function formatCredentialItemAsMarkdown(
  item: CredentialItem,
  options: CredentialItemMarkdownFormatOptions,
) {
  const { headingLevel = 3, format, exportBlankFields = true } = options;
  const headingPrefix = '#'.repeat(headingLevel);
  const title = escapeMarkdownValue(item.title) || PWM_TEXT.UNTITLED_ITEM;
  const username = wrapInlineCode(item.username);
  const password = wrapInlineCode(item.password);
  const urls = format === 'callout' ? formatCalloutUrls(item) : formatMarkdownUrls(item);
  const notes = format === 'callout' ? formatCalloutIndentedValue(item.notes) : formatMarkdownIndentedValue(item.notes);
  const expiration = wrapInlineCode(item.expiresAt ?? '');

  const hasUsername = !!username;
  const hasPassword = !!password;
  const hasUrls = !!urls;
  const hasNotes = !!notes;
  const hasExpiration = !!expiration;

  if (format === 'callout') {
    const lines = [`> [!info] ${title}`];

    if (exportBlankFields || hasUsername) {
      lines.push(`> - ${getMarkdownFieldLabel('username')}：${username}`);
    }
    if (exportBlankFields || hasPassword) {
      lines.push(`> - ${getMarkdownFieldLabel('password')}：${password}`);
    }
    if (exportBlankFields || hasUrls) {
      lines.push(`> - ${getMarkdownFieldLabel('url')}：${urls}`);
    }
    if (exportBlankFields || hasNotes) {
      lines.push(`> - ${getMarkdownFieldLabel('notes')}：${notes}`);
    }
    if (exportBlankFields || hasExpiration) {
      lines.push(`> - ${getMarkdownFieldLabel('expiration')}：${expiration}`);
    }

    return lines.join('\n');
  }

  const lines = [`${headingPrefix} ${title}`, ''];

  if (exportBlankFields || hasUsername) {
    lines.push(`- ${getMarkdownFieldLabel('username')}：${username}`);
  }
  if (exportBlankFields || hasPassword) {
    lines.push(`- ${getMarkdownFieldLabel('password')}：${password}`);
  }
  if (exportBlankFields || hasUrls) {
    lines.push(`- ${getMarkdownFieldLabel('url')}：${urls}`);
  }
  if (exportBlankFields || hasNotes) {
    lines.push(`- ${getMarkdownFieldLabel('notes')}：${notes}`);
  }
  if (exportBlankFields || hasExpiration) {
    lines.push(`- ${getMarkdownFieldLabel('expiration')}：${expiration}`);
  }

  return lines.join('\n');
}