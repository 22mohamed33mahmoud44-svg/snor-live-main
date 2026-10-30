/// <reference lib="deno.ns" />
import { isAdultBirthdate, latestEligibleBirthdate } from '../../src/utils/ageEligibility.ts';

function assert(condition: unknown, explanation: string) {
  if (!condition) throw new Error(explanation);
}

Deno.test('birthday is eligible on exactly the eighteenth calendar anniversary', () => {
  const now = new Date(2026, 9, 30, 12);
  assert(latestEligibleBirthdate(now) === '2008-10-30', 'wrong date input cutoff');
  assert(isAdultBirthdate('2008-10-30', now), 'eighteenth birthday was rejected');
  assert(!isAdultBirthdate('2008-10-31', now), 'seventeen-year-old was accepted');
  assert(isAdultBirthdate('2008-10-29', now), 'older person was rejected');
});

Deno.test('leap-year birthdays use the conservative calendar boundary', () => {
  const feb28 = new Date(2026, 1, 28, 12);
  const march1 = new Date(2026, 2, 1, 12);
  assert(!isAdultBirthdate('2008-02-29', feb28), 'leap-day birthday prematurely accepted');
  assert(isAdultBirthdate('2008-02-29', march1), 'leap-day birthday rejected after March 1');
  assert(latestEligibleBirthdate(new Date(2024, 1, 29, 12)) === '2006-02-28', 'leap cutoff rolled into March');
});

Deno.test('invalid, impossible, and future dates never satisfy onboarding', () => {
  const now = new Date(2026, 9, 30, 12);
  for (const invalid of ['', '2008-02-30', '2026-13-01', '2026-00-01', '2008-2-1', 'not-a-date', '9999-12-31', '2008-10-30T00:00:00']) {
    assert(!isAdultBirthdate(invalid, now), `invalid date accepted: ${invalid}`);
  }
});
