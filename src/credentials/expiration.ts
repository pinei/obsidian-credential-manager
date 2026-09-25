export type CredentialExpirationStatus = 'no-expiration' | 'active' | 'expiring-soon' | 'expired';

export const DEFAULT_EXPIRATION_WARNING_DAYS = 30;

export interface CredentialExpirationState {
  status: CredentialExpirationStatus;
  daysRemaining?: number;
}

export function getCredentialExpirationState(
  expiresAt: string | undefined,
  today = getCurrentDate(),
  warningDays = DEFAULT_EXPIRATION_WARNING_DAYS,
): CredentialExpirationState {
  if (!isCalendarDate(expiresAt)) {
    return { status: 'no-expiration' };
  }

  const daysRemaining = differenceInCalendarDays(today, expiresAt);
  if (daysRemaining < 0) {
    return { status: 'expired', daysRemaining };
  }

  return {
    status: daysRemaining <= Math.max(0, warningDays) ? 'expiring-soon' : 'active',
    daysRemaining,
  };
}

function getCurrentDate() {
  const now = new Date();
  return formatCalendarDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function differenceInCalendarDays(fromDate: string, toDate: string) {
  const from = parseCalendarDate(fromDate);
  const to = parseCalendarDate(toDate);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function isCalendarDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = parseCalendarDate(value);
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function parseCalendarDate(value: string) {
  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatCalendarDate(year: number, month: number, day: number) {
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}