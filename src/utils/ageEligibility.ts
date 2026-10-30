// Dates in onboarding are calendar dates, not elapsed-day durations.
// Keep the client-side cutoff identical to the date-input maximum.
// Server-side enforcement remains a separate release requirement.
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function latestEligibleBirthdate(today: Date = new Date(), minimumAge = 18): string {
  if (!Number.isFinite(today.getTime()) || !Number.isInteger(minimumAge) || minimumAge < 0) {
    throw new Error('Invalid date or minimum age');
  }
  const year = today.getFullYear() - minimumAge;
  const month = today.getMonth() + 1;
  const lastDayOfMonth = new Date(year, month, 0).getDate();
  const day = Math.min(today.getDate(), lastDayOfMonth);
  return [String(year).padStart(4, '0'), String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-');
}

export function isAdultBirthdate(birthdate: string, today: Date = new Date()): boolean {
  const parts = DATE_PATTERN.exec(birthdate);
  if (!parts || !Number.isFinite(today.getTime())) return false;
  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  if (year < 1000 || month < 1 || month > 12 || day < 1) return false;
  if (day > new Date(year, month, 0).getDate()) return false;
  return birthdate <= latestEligibleBirthdate(today);
}
