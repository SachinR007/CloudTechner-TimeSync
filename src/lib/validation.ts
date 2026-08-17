const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BUSINESS_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function formString(formData: FormData, key: string, options: { max?: number } = {}): string | null {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) return null;
  const max = options.max ?? 255;
  if (value.length > max) throw new Error(`${key} is too long.`);
  return value;
}

export function requireString(formData: FormData, key: string, label: string, options: { max?: number } = {}) {
  const value = formString(formData, key, options);
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

export function validateEmail(value: string, label = "Email") {
  const normalized = value.trim().toLowerCase();
  if (!EMAIL_RE.test(normalized) || normalized.length > 254) {
    throw new Error(`${label} is invalid.`);
  }
  return normalized;
}

export function validateRecordId(value: string, label = "ID") {
  const normalized = value.trim();
  if (!normalized || (!UUID_RE.test(normalized) && !BUSINESS_ID_RE.test(normalized))) {
    throw new Error(`${label} is invalid.`);
  }
  return normalized;
}

export function optionalRecordId(value: string | null | undefined, label = "ID") {
  if (!value || value === "none") return null;
  return validateRecordId(value, label);
}

export function validateEnum<T extends string>(value: string | null | undefined, allowed: readonly T[], fallback: T, label: string): T {
  if (!value) return fallback;
  if (!allowed.includes(value as T)) throw new Error(`${label} is invalid.`);
  return value as T;
}

export function parseISODateValue(value: string | null | undefined, label: string): Date | null {
  if (!value) return null;
  if (!ISO_DATE_RE.test(value)) throw new Error(`${label} is invalid.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} is invalid.`);
  }
  return date;
}

export function parseISODateFromForm(formData: FormData, key: string, label: string): Date | null {
  return parseISODateValue(formString(formData, key, { max: 10 }), label);
}

export function parseDecimalFromForm(
  formData: FormData,
  key: string,
  label: string,
  options: { min?: number; max?: number } = {}
): number | null {
  const value = formString(formData, key, { max: 20 });
  if (value === null) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be a valid number.`);
  if (options.min !== undefined && number < options.min) throw new Error(`${label} is too small.`);
  if (options.max !== undefined && number > options.max) throw new Error(`${label} is too large.`);
  return number;
}

export function validateBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} is invalid.`);
  return value;
}

export function validateBoundedText(value: string, label: string, max = 1000) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  if (trimmed.length > max) throw new Error(`${label} is too long.`);
  return trimmed;
}
