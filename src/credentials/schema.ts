import { PWM_TEXT } from '../lang';
import type { CredentialType } from '../util/types';

export const CREDENTIAL_TYPES: Array<{ value: CredentialType; label: string }> = [
  { value: 'login', label: 'Login' },
  { value: 'app-registration', label: 'App registration' },
  { value: 'api-token', label: 'API token' },
  { value: 'database', label: 'Database' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'ssh-key', label: 'SSH key' },
  { value: 'cloud-credentials', label: 'Cloud credentials' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'personal-id', label: 'Personal ID' },
  { value: 'payment-card', label: 'Credit/debit card' },
  { value: 'generic-secret', label: 'Generic secret' },
];

const CREDENTIAL_TYPE_VALUES = new Set(CREDENTIAL_TYPES.map(({ value }) => value));

export function isCredentialType(value: unknown): value is CredentialType {
  return typeof value === 'string' && CREDENTIAL_TYPE_VALUES.has(value as CredentialType);
}

export function getCredentialTypeLabel(type: CredentialType) {
  return CREDENTIAL_TYPES.find(({ value }) => value === type)?.label ?? type;
}

export function getCredentialFieldLabel(key: string) {
  const labels: Record<string, string> = {
    username: PWM_TEXT.USERNAME,
    password: PWM_TEXT.PASSWORD,
    clientId: PWM_TEXT.CLIENT_ID,
    tenantId: PWM_TEXT.TENANT_ID,
    tokenName: PWM_TEXT.TOKEN_NAME,
    tokenValuePrimary: PWM_TEXT.TOKEN_VALUE_PRIMARY,
    tokenValueSecondary: PWM_TEXT.TOKEN_VALUE_SECONDARY,
    provider: PWM_TEXT.PROVIDER,
    engine: PWM_TEXT.ENGINE,
    databaseServiceName: PWM_TEXT.DATABASE_SERVICE_NAME,
    schema: PWM_TEXT.SCHEMA,
    host: PWM_TEXT.HOST,
    certName: PWM_TEXT.CERT_NAME,
    thumbprint: PWM_TEXT.THUMBPRINT,
    keyName: PWM_TEXT.KEY_NAME,
    accountName: PWM_TEXT.ACCOUNT_NAME,
    name: PWM_TEXT.WEBHOOK_NAME,
    method: PWM_TEXT.METHOD,
    documentType: PWM_TEXT.DOCUMENT_TYPE,
    idNumber: PWM_TEXT.ID_NUMBER,
    fullName: PWM_TEXT.FULL_NAME,
    dateOfBirth: PWM_TEXT.DATE_OF_BIRTH,
    issueDate: PWM_TEXT.ISSUE_DATE,
    issuingCountry: PWM_TEXT.ISSUING_COUNTRY,
    issuingAuthority: PWM_TEXT.ISSUING_AUTHORITY,
    cardBrand: PWM_TEXT.CARD_BRAND,
    cardholderName: PWM_TEXT.CARDHOLDER_NAME,
    cardNumber: PWM_TEXT.CARD_NUMBER,
    issuingBank: PWM_TEXT.ISSUING_BANK,
    cvv: PWM_TEXT.CVV,
    pin: PWM_TEXT.PIN,
    billingAddress: PWM_TEXT.BILLING_ADDRESS,
    fieldName: PWM_TEXT.FIELD_NAME,
    value: PWM_TEXT.VALUE,
  };
  return labels[key] ?? key.replace(/[A-Z]/g, (letter) => ` ${letter}`).replace(/^./, (letter) => letter.toUpperCase());
}