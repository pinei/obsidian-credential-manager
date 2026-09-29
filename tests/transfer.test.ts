import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  formatMarkdownDocument,
  getMarkdownDocumentKind,
  parseImportPayload,
  parseMarkdownGroups,
  parseMarkdownItems,
} from '../src/data/transfer';
import { importGroupsFromText, importItemsFromText, importLibraryFromText } from '../src/data/import-service';
import { DEFAULT_DATA } from '../src/data/defaults';
import type { CredentialGroup, CredentialItem, CredentialType } from '../src/util/types';

const credentialTypes: CredentialType[] = [
  'login',
  'app-registration',
  'api-token',
  'database',
  'certificate',
  'ssh-key',
  'cloud-credentials',
  'webhook',
  'personal-id',
  'payment-card',
  'generic-secret',
];

const groups: CredentialGroup[] = [
  { id: 'group-a', name: 'Primary', createdAt: 100, order: 0 },
  { id: 'group-b', name: 'Shared', createdAt: 200, order: 1 },
];

function createItem(type: CredentialType, index: number): CredentialItem {
  const data = type === 'login'
    ? { username: `user-${index}`, password: `secret-${index}` }
    : type === 'generic-secret'
      ? { fieldName: 'Multiline value', value: 'first line\nsecond line' }
      : type === 'payment-card'
        ? { cardNumber: '4111 1111 1111 1111', billingAddress: 'Line 1\nLine 2', cvv: '123' }
        : { [`${type}Field`]: `value-${index}` };

  return {
    id: `item-${index}`,
    groupIds: index === 0 ? ['group-a', 'group-b'] : [index % 2 ? 'group-a' : 'group-b'],
    title: `${type} credential`,
    type,
    data,
    username: type === 'login' ? data.username ?? '' : '',
    password: type === 'login' ? data.password ?? '' : '',
    urls: [`https://example.com/${index}`, `ssh://host/${index}`],
    notes: `note ${index}\ncontinued`,
    expiresAt: '2030-12-31',
    pinned: index % 2 === 0,
    createdAt: 1000 + index,
    updatedAt: 2000 + index,
    order: index,
  };
}

const items = credentialTypes.map(createItem);

(['markdown', 'callout'] as const).forEach((format) => describe(`${format} Markdown transfer`, () => {
  it('round-trips every credential type and common field', () => {
    const text = formatMarkdownDocument('groups', groups, items, format, true);
    const parsed = parseMarkdownItems(text, {} as never, 'group-a');

    assert.equal(getMarkdownDocumentKind(text), 'groups');
    assert.equal(parsed.length, items.length);
    parsed.forEach((item) => {
      const source = items.find(({ title }) => title === item.title)!;
      assert.equal(item.title, source.title);
      assert.equal(item.type, source.type);
      assert.deepEqual(item.data, source.data);
      assert.deepEqual(item.urls, source.urls);
      assert.equal(item.notes, source.notes);
      assert.equal(item.expiresAt, source.expiresAt);
      assert.equal(item.pinned, source.pinned);
      assert.equal(item.createdAt, source.createdAt);
      assert.equal(item.updatedAt, source.updatedAt);
    });
  });

  it('exports shared items once and retains all group tags', () => {
    const text = formatMarkdownDocument('groups', groups, [items[0]!], format, true);
    const parsedGroups = parseMarkdownGroups(text);
    const parsedItems = parsedGroups.flatMap(({ items: groupItems }) => groupItems);

    assert.equal(parsedItems.length, 1);
    assert.deepEqual(parsedItems[0]?.groupNames, ['Primary', 'Shared']);
  });
}));

describe('JSON transfer v2', () => {
  it('accepts complete polymorphic item collections', () => {
    const payload = {
      version: 2,
      kind: 'items',
      exportedAt: 1234,
      data: { groups, items },
    };

    assert.deepEqual(parseImportPayload(JSON.stringify(payload)), payload);
  });

  it('rejects old versions and invalid credential types', () => {
    assert.throws(() => parseImportPayload(JSON.stringify({
      version: 1,
      kind: 'items',
      exportedAt: 1234,
      data: { groups, items },
    })), /Invalid import payload/);

    assert.throws(() => parseImportPayload(JSON.stringify({
      version: 2,
      kind: 'items',
      exportedAt: 1234,
      data: { groups, items: [{ ...items[0], type: 'unknown' }] },
    })), /Invalid import payload/);
  });
});

describe('import workflow semantics', () => {
  it('remaps imported groups and retains shared polymorphic items', () => {
    const destination = structuredClone(DEFAULT_DATA);
    const sourceItem = items[0]!;
    const payload = {
      version: 2,
      kind: 'groups',
      exportedAt: 1234,
      data: { groups, items: [sourceItem] },
    };

    const importedGroups = importGroupsFromText(JSON.stringify(payload), destination);
    const importedItem = destination.items.find(({ title }) => title === sourceItem.title)!;

    assert.equal(importedGroups.length, 2);
    assert.notEqual(importedItem.id, sourceItem.id);
    assert.deepEqual(importedItem.groupIds, importedGroups.map(({ id }) => id));
    assert.equal(importedItem.type, sourceItem.type);
    assert.deepEqual(importedItem.data, sourceItem.data);
    assert.equal(importedItem.expiresAt, sourceItem.expiresAt);
    assert.equal(importedItem.createdAt, sourceItem.createdAt);
    assert.equal(importedItem.updatedAt, sourceItem.updatedAt);
  });

  it('attaches selected items only to the current target group', () => {
    const destination = structuredClone(DEFAULT_DATA);
    const targetGroupId = destination.groups[0]!.id;
    const sourceItem = items.find(({ type }) => type === 'payment-card')!;
    const payload = {
      version: 2,
      kind: 'items',
      exportedAt: 1234,
      data: { groups, items: [sourceItem] },
    };

    const imported = importItemsFromText(JSON.stringify(payload), destination, targetGroupId)[0]!;

    assert.deepEqual(imported.groupIds, [targetGroupId]);
    assert.equal(imported.type, 'payment-card');
    assert.deepEqual(imported.data, sourceItem.data);
    assert.equal(imported.expiresAt, sourceItem.expiresAt);
  });

  it('rebuilds Markdown libraries while preserving local settings and clearing trash', async () => {
    const currentData = structuredClone(DEFAULT_DATA);
    currentData.settings.confirmBeforeDelete = false;
    currentData.trash = [{ ...items[0]!, deletedAt: 999 }];
    const text = formatMarkdownDocument('library', groups, items, 'markdown', true);

    const imported = await importLibraryFromText(text, undefined, currentData);

    assert.deepEqual(imported.groups.map(({ name }) => name), groups.map(({ name }) => name));
    assert.equal(imported.items.length, items.length);
    assert.equal(imported.items.find(({ type }) => type === 'generic-secret')?.data.value, 'first line\nsecond line');
    assert.deepEqual(imported.settings, currentData.settings);
    assert.deepEqual(imported.trash, []);
  });
});
