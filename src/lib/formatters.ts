/**
 * Formats phone number progressively as user types:
 * - 123 -> (123
 * - 1234 -> (123) 4
 * - 123456 -> (123) 456
 * - 1234567 -> (123) 456-7
 * - 1234567890 -> (123) 456-7890
 * - 11 digits starting with 1: +1 (XXX) XXX-XXXX
 */
export function formatPhoneAsYouType(input: string): string {
  if (!input) return '';
  const digits = input.replace(/\D/g, '');

  if (digits.length === 0) return '';

  // Handle US numbers with leading 1 (11 digits)
  if (digits.length > 10 && digits.startsWith('1')) {
    const d = digits.slice(1);
    if (d.length <= 3) return `+1 (${d}`;
    if (d.length <= 6) return `+1 (${d.slice(0, 3)}) ${d.slice(3)}`;
    return `+1 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`;
  }

  // Handle standard 10-digit US numbers
  if (digits.length <= 3) {
    return `(${digits}`;
  }
  if (digits.length <= 6) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

/**
 * Validates whether a phone number has at least 10 valid digits
 */
export function isValidPhone(phone: string): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
}

/**
 * Validates email format standard
 */
export function isValidEmail(email: string): boolean {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/**
 * Formats a US Zip Code (5 digits or ZIP+4)
 */
export function formatZipCode(val: string): string {
  const digits = val.replace(/\D/g, '').slice(0, 9);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/**
 * Formats claim numbers: clean whitespace and uppercase
 */
export function formatClaimNumber(val: string): string {
  return val.toUpperCase().replace(/\s+/g, '');
}

/**
 * Trims extra whitespace and collapses multiple spaces into one
 */
export function cleanWhitespace(val: string): string {
  return val.trim().replace(/\s+/g, ' ');
}
