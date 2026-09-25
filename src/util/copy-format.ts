import { formatCredentialItemAsMarkdown } from './markdown-item-format';
import type { PasswordCopyFormat, CredentialGroup, CredentialItem } from './types';
function getGroupNames(item: CredentialItem, groups: CredentialGroup[]) {
  const groupNameMap = new Map(groups.map((group) => [group.id, group.name]));
  return item.groupIds.map((groupId) => groupNameMap.get(groupId)).filter((name): name is string => !!name && !!name.trim());
}

export function formatCredentialItemForCopy(
  item: CredentialItem,
  groups: CredentialGroup[],
  format: PasswordCopyFormat,
  copyBlankFields: boolean,
) {
  void getGroupNames(item, groups);

  return formatCredentialItemAsMarkdown(item, {
    headingLevel: 3,
    format,
    exportBlankFields: copyBlankFields,
  });
}