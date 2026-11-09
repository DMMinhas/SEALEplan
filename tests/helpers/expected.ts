/**
 * Hand-computed from seed/respondents.ts (numbers = respondent index):
 *
 * Wed 10:00  Available (20): 1 2 4 5 6 7 9 10 11 12 13 17 18 19 20 22 24 25 26 29
 *            If needed  (7): 3 8 14 15 23 27 30
 *            Unavailable(3): 16 Imran Sheikh, 21 Rajesh Karki, 28 Chantrea Lim
 *            score = 20 + 7 × 0.5 = 23.5
 * Tue 10:00  Available (19): 1 2 3 4 5 7 9 10 11 13 15 17 18 19 20 24 25 27 29
 *            If needed  (8): 6 8 12 14 21 23 26 30
 *            Unavailable(3): 16 Imran Sheikh, 22 Anjali Rai, 28 Chantrea Lim
 *            score = 19 + 8 × 0.5 = 23.0
 * Wed 09:00  A 17, I 6  → 20.0
 * Tue 09:00  A 16, I 7  → 19.5
 * Thu 10:00  A 15, I 7  → 18.5
 * (next: Thu 09:00 A 15, I 5 → 17.5)
 */
export const HAND_COMPUTED_TOP5 = [
  { weekday: 3, startHour: 10, available: 20, ifNeeded: 7, score: 23.5 },
  { weekday: 2, startHour: 10, available: 19, ifNeeded: 8, score: 23 },
  { weekday: 3, startHour: 9, available: 17, ifNeeded: 6, score: 20 },
  { weekday: 2, startHour: 9, available: 16, ifNeeded: 7, score: 19.5 },
  { weekday: 4, startHour: 10, available: 15, ifNeeded: 7, score: 18.5 },
];

