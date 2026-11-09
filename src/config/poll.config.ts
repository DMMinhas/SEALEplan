/**
 * Single source of truth for everything a coordinator may want to change
 * without touching application code.
 *
 * Slots are always expressed in the reference time zone (Europe/Berlin,
 * labelled "CET/CEST"). They are stored as (weekday, start hour) in Berlin
 * wall-clock time, never as UTC offsets, so a "Tue 10:00" slot keeps meaning
 * 10:00 in Berlin across daylight-saving changes.
 */
export const pollConfig = {
  title: "Weekly Proposal Meeting – Availability",
  subtitle: "SEALE CBHE Proposal Consortium (Pakistan–Nepal–Cambodia)",

  /** IANA zone the slots are defined in. Do not change once responses exist. */
  referenceTimeZone: "Europe/Berlin",
  referenceTimeZoneLabel: "CET/CEST",

  grid: {
    /** ISO weekdays: 1 = Monday … 7 = Sunday. */
    days: [1, 2, 3, 4, 5],
    /** First block starts at this hour (reference time zone). */
    startHour: 9,
    /** Last block ends at this hour (exclusive). 17 → last block 16:00–17:00. */
    endHour: 17,
    /** Block length in minutes. Must be a whole number of hours. */
    slotMinutes: 60,
  },

  /** How far ahead to look for a DST change that shifts participants' local times. */
  dstLookaheadWeeks: 26,

  /** Shown at the top of the country / time-zone pickers. */
  priorityCountries: ["DE", "PK", "NP", "KH"],
  priorityTimeZones: ["Europe/Berlin", "Asia/Karachi", "Asia/Kathmandu", "Asia/Phnom_Penh"],

  privacy: {
    controller: "the SEALE proposal coordination team",
    /** Placeholder – replace with the real contact address before sharing the link. */
    contactEmail: "seale-coordination@example.org",
    retention:
      "Responses are deleted once the weekly meeting slot has been fixed, and at the latest when the proposal is submitted.",
  },

  rateLimit: {
    /** Max submissions per IP address per window. */
    maxRequests: 10,
    windowSeconds: 600,
  },
} as const;

export type PollConfig = typeof pollConfig;
