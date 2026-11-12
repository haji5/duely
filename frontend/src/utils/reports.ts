/**
 * Reasons a bracket or comment can be reported for. The server accepts exactly these codes
 * (ReportReasons.java); both test suites check them against shared/report-reasons.json.
 */
export const REPORT_REASONS = [
  { value: 'spam', label: 'Spam or advertising' },
  { value: 'harassment', label: 'Harassment or hate' },
  { value: 'sexual', label: 'Sexual content' },
  { value: 'personal-info', label: 'Someone’s personal details' },
  { value: 'illegal', label: 'Illegal, or someone else’s copyright' },
  { value: 'other', label: 'Something else' },
] as const;

export type ReportReason = typeof REPORT_REASONS[number]['value'];

export const reasonLabel = (value: string): string =>
  REPORT_REASONS.find(r => r.value === value)?.label ?? value;

/**
 * Whether ID-token claims make the user an admin, as FirebaseAuthenticationFilter decides it:
 * {"role": "admin"} in any case, or {"admin": true}. Only for showing admin controls; the server
 * checks every admin request itself.
 */
export function isAdminClaims(claims: Record<string, unknown>): boolean {
  return claims.admin === true
    || (typeof claims.role === 'string' && claims.role.toUpperCase() === 'ADMIN');
}
