import { z } from "zod";
import { GRID, isGridSlot, slotKey } from "@/lib/grid";
import { CONTROL_CHARS, cleanText } from "@/lib/normalize";
import { isCountryCode } from "@/lib/countries";
import { isValidTimeZone } from "@/lib/time";

const text = (label: string, max: number) =>
  z
    .string({ required_error: `${label} is required`, invalid_type_error: `${label} is required` })
    .max(max * 2, `${label} is too long`)
    .refine((s) => !CONTROL_CHARS.test(s), `${label} contains invalid characters`)
    .transform(cleanText)
    .pipe(
      z
        .string()
        .min(1, `${label} is required`)
        .max(max, `${label} must be at most ${max} characters`),
    );

export const slotChoiceSchema = z
  .object({
    weekday: z.number().int().min(1).max(7),
    startHour: z.number().int().min(0).max(23),
    preference: z.enum(["available", "if_needed"]),
  })
  .strict()
  .refine((s) => isGridSlot(s.weekday, s.startHour), "Slot is not part of the poll grid");

export const submissionSchema = z
  .object({
    name: text("Full name", 100),
    organization: text("Organization", 150),
    country: z
      .string({ required_error: "Country is required" })
      .refine(isCountryCode, "Please choose a country from the list"),
    timezone: z
      .string({ required_error: "Time zone is required" })
      .refine(isValidTimeZone, "Please choose a valid time zone"),
    slots: z
      .array(slotChoiceSchema)
      .max(GRID.length)
      .refine(
        (slots) => new Set(slots.map((s) => slotKey(s.weekday, s.startHour))).size === slots.length,
        "Duplicate slots",
      ),
    editToken: z.string().min(16).max(128).optional().nullable(),
    /** Honeypot – must stay empty. Checked separately so bots get a fake success. */
    company_website: z.string().max(500).optional(),
  })
  .strict();

export type Submission = z.infer<typeof submissionSchema>;

export const editTokenSchema = z.object({ editToken: z.string().min(16).max(128) }).strict();

export const deadlineSchema = z
  .object({
    deadlineAt: z
      .string()
      .datetime({ offset: true })
      .nullable(),
  })
  .strict();

export const uuidSchema = z.string().uuid();

/** Flatten Zod issues to { field: message } for the form. */
export function issuesToFields(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    out[field] ??= issue.message;
  }
  return out;
}
