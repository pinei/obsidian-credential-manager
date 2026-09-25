import { createId } from '../util/id';
import { PWM_TEXT, formatPWMText } from '../lang';
import { validateFileSafeName } from '../util/file-name';
import { getNextDuplicatedTitle } from '../util/duplicate-title';
import { normalizeGroupIds } from './normalize';
import type { CredentialGroup, CredentialItem, CredentialManagerData, CredentialType } from '../util/types';

function touchItem(item: CredentialItem) {
  item.updatedAt = Date.now();
}

export function createGroup(data: CredentialManagerData, name?: string) {
  const group: CredentialGroup = {
    id: createId(),
    name: name?.trim() || `${PWM_TEXT.GENERATED_NEW_GROUP_NAME} ${data.groups.length + 1}`,
    createdAt: Date.now(),
    order: data.groups.length,
  };

  data.groups.push(group);
  return group;
}

export function updateGroupName(data: CredentialManagerData, groupId: string, name: string) {
  const group = data.groups.find((item) => item.id === groupId);
  if (!group) {
    return PWM_TEXT.GROUP_NOT_FOUND;
  }

  const validationError = validateFileSafeName(name);
  if (validationError) {
    return formatPWMText(PWM_TEXT.INVALID_GROUP_NAME_WITH_REASON, { reason: validationError });
  }

  const nextName = name.trim();
  if (nextName === group.name) {
    return null;
  }

  group.name = nextName;
  return null;
}

export function createItem(data: CredentialManagerData, groupId: string, type: CredentialType = 'login') {
  const now = Date.now();
  const item: CredentialItem = {
    id: createId(),
    groupIds: [groupId],
    title: PWM_TEXT.GENERATED_NEW_ITEM_TITLE,
    type,
    data: createCredentialData(type),
    username: '',
    password: '',
    urls: [],
    notes: '',
    expiresAt: undefined,
    pinned: false,
    createdAt: now,
    updatedAt: now,
    order: data.items.length,
  };

  data.items.push(item);
  return item;
}

export function duplicateItem(data: CredentialManagerData, itemId: string) {
  const source = data.items.find((item) => item.id === itemId);
  if (!source) {
    return null;
  }

  const now = Date.now();
  const item: CredentialItem = {
    ...structuredClone(source),
    id: createId(),
    title: getNextDuplicatedTitle(data.items, source.title),
    createdAt: now,
    updatedAt: now,
    order: data.items.length,
  };

  const sourceIndex = data.items.findIndex((entry) => entry.id === itemId);
  const nextItems = [...data.items];
  nextItems.splice(sourceIndex + 1, 0, item);
  data.items = nextItems;
  reindexOrders(data);
  return item;
}

export function updateItemTitle(data: CredentialManagerData, itemId: string, title: string) {
  const item = data.items.find((entry) => entry.id === itemId);
  if (!item) {
    return PWM_TEXT.ITEM_NOT_FOUND;
  }

  const validationError = validateFileSafeName(title);
  if (validationError) {
    return formatPWMText(PWM_TEXT.INVALID_ITEM_TITLE_WITH_REASON, { reason: validationError });
  }

  const nextTitle = title.trim();
  if (nextTitle === item.title) {
    return null;
  }

  item.title = nextTitle;
  touchItem(item);
  return null;
}

export function updateItem(data: CredentialManagerData, itemId: string, patch: Partial<Omit<CredentialItem, 'id'>>) {
  const item = data.items.find((entry) => entry.id === itemId);
  if (!item) {
    return;
  }

  const nextPatch = { ...patch };
  if ('groupIds' in nextPatch) {
    const fallbackGroupId = item.groupIds[0] ?? getFallbackGroupId(data) ?? data.groups[0]?.id ?? '';
    nextPatch.groupIds = normalizeGroupIds(
      nextPatch.groupIds,
      fallbackGroupId,
      data.groups.map((group) => group.id),
    );
  }

  const before = JSON.stringify(item);
  Object.assign(item, nextPatch);
  const after = JSON.stringify(item);
  if (before !== after) {
    touchItem(item);
  }
}

export function deleteGroup(data: CredentialManagerData, groupId: string) {
  data.items = data.items.filter((item) => {
    if (!item.groupIds.includes(groupId)) {
      return true;
    }

    const nextGroupIds = item.groupIds.filter((id) => id !== groupId);
    if (!nextGroupIds.length) {
      return false;
    }

    item.groupIds = nextGroupIds;
    touchItem(item);
    return true;
  });

  data.groups = data.groups.filter((group) => group.id !== groupId);
  reindexOrders(data);
  return true;
}

export function deleteItem(data: CredentialManagerData, itemId: string) {
  const item = data.items.find((entry) => entry.id === itemId);
  if (!item) {
    return null;
  }

  data.items = data.items.filter((entry) => entry.id !== itemId);
  reindexOrders(data);
  return item;
}

export function moveGroup(data: CredentialManagerData, groupId: string, toIndex: number) {
  moveGroups(data, [groupId], toIndex);
}

export function moveGroups(data: CredentialManagerData, groupIds: string[], toIndex: number) {
  const groups = [...data.groups];
  const selectedIds = new Set(groupIds);
  const movingGroups = groups.filter((group) => selectedIds.has(group.id));
  if (!movingGroups.length) {
    return;
  }

  const remainingGroups = groups.filter((group) => !selectedIds.has(group.id));
  const boundedIndex = Math.max(0, Math.min(toIndex, remainingGroups.length));
  remainingGroups.splice(boundedIndex, 0, ...movingGroups);
  data.groups = remainingGroups;
  reindexOrders(data);
}

export function moveItemWithinGroup(data: CredentialManagerData, itemId: string, toIndex: number, groupId: string) {
  moveItemsWithinGroup(data, [itemId], toIndex, groupId);
}

export function moveItemsWithinGroup(data: CredentialManagerData, itemIds: string[], toIndex: number, groupId: string) {
  const visibleItems = data.items.filter((item) => item.groupIds.includes(groupId));
  const selectedIds = new Set(itemIds.filter((itemId) => visibleItems.some((item) => item.id === itemId)));
  const movingItems = visibleItems.filter((item) => selectedIds.has(item.id));
  if (!movingItems.length) {
    return;
  }

  const remainingVisibleItems = visibleItems.filter((item) => !selectedIds.has(item.id));
  const boundedIndex = Math.max(0, Math.min(toIndex, remainingVisibleItems.length));
  const reordered = [...remainingVisibleItems];
  reordered.splice(boundedIndex, 0, ...movingItems);

  const reorderedIds = reordered.map((item) => item.id);
  const nextItems = [...data.items];
  const visibleIndexSet = new Set(visibleItems.map((item) => item.id));
  let orderCursor = 0;

  for (let index = 0; index < nextItems.length; index += 1) {
    const currentItem = nextItems[index];
    if (!currentItem || !visibleIndexSet.has(currentItem.id)) {
      continue;
    }

    const reorderedId = reorderedIds[orderCursor];
    const reorderedItem = reordered.find((item) => item.id === reorderedId);
    if (reorderedItem) {
      nextItems[index] = reorderedItem;
    }
    orderCursor += 1;
  }

  data.items = nextItems;
  reindexOrders(data);
}

export function assignItemToGroup(data: CredentialManagerData, itemId: string, groupId: string, mode: 'move' | 'add') {
  const item = data.items.find((entry) => entry.id === itemId);
  const group = data.groups.find((entry) => entry.id === groupId);
  if (!item || !group) {
    return false;
  }

  if (mode === 'add') {
    if (item.groupIds.includes(groupId)) {
      return false;
    }
    item.groupIds = [...item.groupIds, groupId];
    touchItem(item);
    return true;
  }

  if (item.groupIds.length === 1 && item.groupIds[0] === groupId) {
    return false;
  }

  item.groupIds = [groupId];
  touchItem(item);
  return true;
}

export function removeItemFromGroup(data: CredentialManagerData, itemId: string, groupId: string) {
  const item = data.items.find((entry) => entry.id === itemId);
  if (!item || !item.groupIds.includes(groupId)) {
    return false;
  }

  if (item.groupIds.length <= 1) {
    return false;
  }

  item.groupIds = item.groupIds.filter((id) => id !== groupId);
  touchItem(item);
  return true;
}

export function reindexOrders(data: CredentialManagerData) {
  data.groups.forEach((group, index) => {
    group.order = index;
  });
  data.items.forEach((item, index) => {
    item.order = index;
  });
}

export function getFallbackGroupId(data: CredentialManagerData) {
  return data.groups[0]?.id;
}

function createCredentialData(type: CredentialType): Record<string, string> {
  switch (type) {
    case 'app-registration':
      return { clientId: '', clientSecret: '', tenantId: '' };
    case 'api-token':
      return { tokenName: '', tokenValuePrimary: '', tokenValueSecondary: '', provider: '' };
    case 'database':
      return { engine: 'postgresql', host: '', port: '', databaseServiceName: '', schema: '', username: '', password: '' };
    case 'certificate':
      return { certName: '', thumbprint: '', privateKeyLocation: '' };
    case 'ssh-key':
      return { keyName: '', username: '', host: '', privateKeyPath: '', passphrase: '' };
    case 'cloud-credentials':
      return { provider: '', accountName: '', accessKeyId: '', secretAccessKey: '' };
    case 'webhook':
      return { name: '', url: '', method: 'POST', signingSecret: '' };
    case 'generic-secret':
      return { fieldName: '', value: '' };
    case 'login':
    default:
      return { username: '', password: '' };
  }
}