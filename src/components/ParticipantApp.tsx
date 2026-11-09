"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import AvailabilityGrid, { type Selection } from "@/components/AvailabilityGrid";
import Combobox, { type ComboOption } from "@/components/Combobox";
import { pollConfig } from "@/config/poll.config";
import {
  GRID,
  PREFERENCE_LABEL,
  WEEKDAY_LONG,
  slotKey,
  slotRangeLabel,
  type Preference,
  type SlotChoice,
} from "@/lib/grid";
import {
  canonicalTimeZone,
  findLocalShift,
  formatDayOffset,
  formatMinutes,
  referenceWeekStart,
  toLocal,
  utcOffsetLabel,
  type LocalShift,
} from "@/lib/time";
import type { CountryOption } from "@/lib/countries";

interface Props {
  pollId: string;
  nowIso: string;
  deadlineAt: string | null;
  closed: boolean;
  countries: CountryOption[];
}

type Fields = { name: string; organization: string; country: string; timezone: string };
type FieldErrors = Partial<Record<keyof Fields | "slots" | "form", string>>;

const tokenKey = (pollId: string) => `seale-edit-token:${pollId}`;
const storage = {
  get(k: string): string | null {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      window.localStorage.setItem(k, v);
    } catch {
      /* private mode – editing still works via name + organization */
    }
  },
  remove(k: string) {
    try {
      window.localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

function toChoices(sel: Selection): SlotChoice[] {
  return GRID.filter((s) => sel.has(slotKey(s.weekday, s.startHour))).map((s) => ({
    ...s,
    preference: sel.get(slotKey(s.weekday, s.startHour)) as Preference,
  }));
}

function formatDeadline(iso: string, tz: string | null): string {
  const d = DateTime.fromISO(iso);
  const berlin = d.setZone(pollConfig.referenceTimeZone);
  const ref = `${berlin.toFormat("ccc d LLL yyyy, HH:mm")} ${berlin.isInDST ? "CEST" : "CET"}`;
  if (!tz || tz === pollConfig.referenceTimeZone) return ref;
  return `${ref} (${d.setZone(tz).toFormat("HH:mm, ccc d LLL")} your time)`;
}

function DstNotice({ shift, timeZone }: { shift: LocalShift | null; timeZone: string }) {
  if (!shift) return null;
  const s = shift.sampleSlot;
  const direction = shift.deltaMinutes < 0 ? "earlier" : "later";
  return (
    <div role="note" className="mt-4 rounded-md border border-amber-700 bg-amber-50 p-3 text-sm text-amber-950">
      <p>
        <strong>Daylight saving time heads-up:</strong> from the week of{" "}
        {shift.fromWeek.toFormat("d LLL yyyy")}, the meeting times move {formatMinutes(shift.deltaMinutes)}{" "}
        {direction} in your time zone ({timeZone}). The meeting stays fixed in Berlin time ({shift.after.refAbbrev}).
      </p>
      <p className="mt-1">
        Example: {WEEKDAY_LONG[s.weekday]} {slotRangeLabel(s.weekday, s.startHour).split(" ")[1]} Berlin time ={" "}
        <strong>{shift.before.localTime}</strong> your time now →{" "}
        <strong>{shift.after.localTime}</strong> from then on.
      </p>
    </div>
  );
}

export default function ParticipantApp({ pollId, nowIso, deadlineAt, closed, countries }: Props) {
  const weekStart = useMemo(() => referenceWeekStart(DateTime.fromISO(nowIso)), [nowIso]);
  const [fields, setFields] = useState<Fields>({ name: "", organization: "", country: "", timezone: "" });
  const [selection, setSelection] = useState<Selection>(new Map());
  const [honeypot, setHoneypot] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<"idle" | "loading" | "saving">("loading");
  const [editToken, setEditToken] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ replacedByName: boolean } | null>(null);
  const [tzOptions, setTzOptions] = useState<ComboOption[]>([]);

  // Detect the browser time zone and load an earlier response via the stored edit token.
  useEffect(() => {
    const raw = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const detected = raw ? canonicalTimeZone(raw) : "";
    setFields((f) => ({ ...f, timezone: f.timezone || detected || pollConfig.referenceTimeZone }));

    let all: string[] = [];
    try {
      all = Intl.supportedValuesOf("timeZone");
    } catch {
      all = [];
    }
    const priority = pollConfig.priorityTimeZones as readonly string[];
    const names = [
      ...new Set([...priority, ...(detected ? [detected] : []), ...all.map(canonicalTimeZone), "UTC"]),
    ];
    const now = DateTime.now();
    setTzOptions(
      names.map((z) => ({ value: z, label: z.replace(/_/g, " "), hint: utcOffsetLabel(z, now) })),
    );

    const token = storage.get(tokenKey(pollId));
    if (!token) {
      setStatus("idle");
      return;
    }
    fetch("/api/responses/me", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ editToken: token }),
    })
      .then(async (res) => {
        if (res.status === 404) {
          storage.remove(tokenKey(pollId));
          return;
        }
        if (!res.ok) return;
        const { response } = await res.json();
        setEditToken(token);
        setLastSaved(response.updatedAt);
        setFields({
          name: response.name,
          organization: response.organization,
          country: response.country,
          timezone: response.timezone,
        });
        setSelection(
          new Map(
            (response.slots as SlotChoice[]).map((s) => [slotKey(s.weekday, s.startHour), s.preference]),
          ),
        );
      })
      .catch(() => undefined)
      .finally(() => setStatus("idle"));
  }, [pollId]);

  const tz = fields.timezone || null;
  const shift = useMemo(() => (tz ? findLocalShift(tz, weekStart) : null), [tz, weekStart]);
  const countryOptions: ComboOption[] = useMemo(
    () => countries.map((c) => ({ value: c.code, label: c.name })),
    [countries],
  );

  const update = (k: keyof Fields) => (v: string) => {
    setFields((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const validate = (): FieldErrors => {
    const e: FieldErrors = {};
    if (!fields.name.trim()) e.name = "Full name is required";
    if (!fields.organization.trim()) e.organization = "Organization is required";
    if (!fields.country) e.country = "Please choose a country from the list";
    if (!fields.timezone) e.timezone = "Please choose your time zone";
    return e;
  };

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (closed) return;
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      document.getElementById(`field-${Object.keys(e)[0]}`)?.focus();
      return;
    }
    if (
      selection.size === 0 &&
      !window.confirm("You have not marked any slot. Submit anyway as unavailable for all slots?")
    ) {
      return;
    }
    setStatus("saving");
    try {
      const res = await fetch("/api/responses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...fields,
          slots: toChoices(selection),
          editToken,
          company_website: honeypot,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) {
        if (body.editToken) {
          storage.set(tokenKey(pollId), body.editToken);
          setEditToken(body.editToken);
        }
        setLastSaved(new Date().toISOString());
        setConfirmation({ replacedByName: !!body.replacedByName });
        window.scrollTo({ top: 0 });
      } else if (res.status === 422 && body.fields) {
        setErrors(body.fields);
      } else if (body.error === "poll_closed") {
        setErrors({ form: "This poll has closed – responses can no longer be submitted or changed." });
      } else if (res.status === 429) {
        setErrors({ form: body.message ?? "Too many attempts – please wait a few minutes." });
      } else {
        setErrors({ form: "Something went wrong while saving. Please try again." });
      }
    } catch {
      setErrors({ form: "Network error – please check your connection and try again." });
    } finally {
      setStatus("idle");
    }
  }

  if (confirmation) {
    return (
      <Confirmation
        fields={fields}
        choices={toChoices(selection)}
        weekStart={weekStart}
        shift={shift}
        replacedByName={confirmation.replacedByName}
        deadlineAt={deadlineAt}
        onEdit={() => setConfirmation(null)}
      />
    );
  }

  const readOnly = closed;
  const inputCls = (err?: string) =>
    `mt-1 w-full rounded-md border bg-white px-3 py-2 text-base disabled:bg-surface disabled:text-muted ${
      err ? "border-red-700" : "border-gray-400"
    }`;

  return (
    <div>
      <h1 className="text-2xl font-bold">Your weekly availability</h1>
      <p className="mt-2 max-w-3xl text-muted">
        We are looking for <strong>one recurring one-hour meeting per week</strong>. All slots are defined in Berlin
        time ({pollConfig.referenceTimeZoneLabel}); your local time is shown next to each slot.
      </p>

      {closed ? (
        <div role="status" className="mt-4 rounded-md border-2 border-red-800 bg-red-50 p-4 text-red-950">
          <p className="font-bold">This poll is closed.</p>
          <p className="mt-1">
            {deadlineAt ? `Responses were accepted until ${formatDeadline(deadlineAt, tz)}. ` : ""}
            Your answers can no longer be submitted or changed. You can still see the{" "}
            <Link href="/results" className="font-semibold underline">
              group results
            </Link>
            .
          </p>
        </div>
      ) : (
        deadlineAt && (
          <p className="mt-3 rounded-md border border-line bg-surface p-3 text-sm">
            <strong>Deadline:</strong> {formatDeadline(deadlineAt, tz)}. You can come back and change your answers
            until then.
          </p>
        )
      )}

      {editToken && lastSaved && (
        <p role="status" className="mt-3 rounded-md border border-blue-800 bg-blue-50 p-3 text-sm text-blue-950">
          You are editing your earlier response (last saved{" "}
          {DateTime.fromISO(lastSaved).toLocaleString(DateTime.DATETIME_MED)}). Submitting again replaces it.
        </p>
      )}

      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-8" aria-busy={status !== "idle"}>
        <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-lg font-semibold">1. About you</legend>
          <div>
            <label htmlFor="field-name" className="block text-sm font-semibold">
              Full name <span aria-hidden="true">*</span>
            </label>
            <input
              id="field-name"
              type="text"
              autoComplete="name"
              required
              maxLength={100}
              value={fields.name}
              onChange={(e) => update("name")(e.target.value)}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? "err-name" : undefined}
              className={inputCls(errors.name)}
            />
            {errors.name && (
              <p id="err-name" className="mt-1 text-sm text-red-800">
                {errors.name}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="field-organization" className="block text-sm font-semibold">
              Organization <span aria-hidden="true">*</span>
            </label>
            <input
              id="field-organization"
              type="text"
              autoComplete="organization"
              required
              maxLength={150}
              value={fields.organization}
              onChange={(e) => update("organization")(e.target.value)}
              aria-invalid={errors.organization ? true : undefined}
              aria-describedby={errors.organization ? "err-organization" : undefined}
              className={inputCls(errors.organization)}
            />
            {errors.organization && (
              <p id="err-organization" className="mt-1 text-sm text-red-800">
                {errors.organization}
              </p>
            )}
          </div>
          <Combobox
            id="field-country"
            label="Country"
            required
            options={countryOptions}
            value={fields.country}
            onChange={update("country")}
            placeholder="Type to search…"
            disabled={readOnly}
            error={errors.country}
          />
          <Combobox
            id="field-timezone"
            label="Time zone"
            required
            options={tzOptions}
            value={fields.timezone}
            onChange={update("timezone")}
            placeholder="e.g. Asia/Kathmandu"
            disabled={readOnly}
            error={errors.timezone}
            description="Detected from your browser – change it if it is wrong."
          />
          <p className="text-xs text-muted sm:col-span-2">
            To change an earlier answer from another device, enter exactly the same name and organization – your
            new answer replaces the old one.
          </p>

          {/* Honeypot: hidden from people and assistive tech; bots tend to fill it. */}
          <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
            <label htmlFor="company_website">Company website (leave empty)</label>
            <input
              id="company_website"
              name="company_website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </div>
        </fieldset>

        <section aria-labelledby="slots-heading">
          <h2 id="slots-heading" className="text-lg font-semibold">
            2. When can you attend?
          </h2>
          <p className="mt-1 text-sm text-muted">
            Times shown for the week of {weekStart.toFormat("d LLL yyyy")}.{" "}
            {tz && tz !== pollConfig.referenceTimeZone && `Your time zone: ${tz} (${utcOffsetLabel(tz, weekStart)}).`}
          </p>
          {tz && <DstNotice shift={shift} timeZone={tz} />}
          <div className="mt-4">
            <AvailabilityGrid
              value={selection}
              setValue={setSelection}
              timeZone={tz}
              weekStart={weekStart}
              disabled={readOnly || status === "loading"}
            />
          </div>
          {errors.slots && <p className="mt-2 text-sm text-red-800">{errors.slots}</p>}
        </section>

        {errors.form && (
          <p role="alert" className="rounded-md border border-red-800 bg-red-50 p-3 text-red-950">
            {errors.form}
          </p>
        )}
        {Object.keys(errors).some((k) => k !== "form" && errors[k as keyof FieldErrors]) && (
          <p role="alert" className="text-sm text-red-800">
            Please fix the highlighted fields above.
          </p>
        )}

        {!readOnly && (
          <button
            type="submit"
            disabled={status !== "idle"}
            className="w-full rounded-md bg-brand px-6 py-3 text-base font-semibold text-white hover:bg-brand-dark disabled:opacity-60 sm:w-auto"
          >
            {status === "saving" ? "Saving…" : editToken ? "Save changes" : "Submit availability"}
          </button>
        )}
      </form>

      <PrivacyNotice />
    </div>
  );
}

function PrivacyNotice() {
  const p = pollConfig.privacy;
  return (
    <section aria-labelledby="privacy-heading" className="mt-10 rounded-md border border-line bg-surface p-4 text-sm">
      <h2 id="privacy-heading" className="font-semibold">
        Privacy notice
      </h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
        <li>
          <strong className="text-ink">What we store:</strong> your name, organization, country, time zone and the
          slots you select. No email address, no login, no tracking or analytics. Your browser keeps a random edit key
          so you can change your answer later.
        </li>
        <li>
          <strong className="text-ink">Who sees it:</strong> only {p.controller} sees individual answers. The public
          results page shows totals only – never names.
        </li>
        <li>
          <strong className="text-ink">How long:</strong> {p.retention}
        </li>
        <li>
          <strong className="text-ink">Deletion or questions:</strong> email{" "}
          <a className="font-semibold text-brand underline" href={`mailto:${p.contactEmail}`}>
            {p.contactEmail}
          </a>
          .
        </li>
      </ul>
    </section>
  );
}

function Confirmation({
  fields,
  choices,
  weekStart,
  shift,
  replacedByName,
  deadlineAt,
  onEdit,
}: {
  fields: Fields;
  choices: SlotChoice[];
  weekStart: DateTime;
  shift: LocalShift | null;
  replacedByName: boolean;
  deadlineAt: string | null;
  onEdit: () => void;
}) {
  const tz = fields.timezone;
  return (
    <div>
      <div role="status" className="rounded-md border-2 border-avail bg-emerald-50 p-4 text-emerald-950">
        <h1 className="text-2xl font-bold">
          <span aria-hidden="true">✓ </span>Thank you, {fields.name}!
        </h1>
        <p className="mt-1">Your availability has been saved.</p>
        {replacedByName && (
          <p className="mt-2">
            A response for the same name and organization already existed – it has been replaced by this one.
          </p>
        )}
        <p className="mt-2 text-sm">
          You can change your answers {deadlineAt ? `until ${formatDeadline(deadlineAt, tz)}` : "until the poll closes"}{" "}
          by opening this page again in this browser, or by entering the same name and organization.
        </p>
      </div>

      <h2 className="mt-6 text-lg font-semibold">Your choices</h2>
      <p className="text-sm text-muted">
        Berlin time and your local time ({tz}) for the week of {weekStart.toFormat("d LLL yyyy")}.
      </p>
      {choices.length === 0 ? (
        <p className="mt-3">You marked no slots, so you are recorded as unavailable for all of them.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[20rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th scope="col" className="py-2 pr-3">Berlin time</th>
                <th scope="col" className="py-2 pr-3">Your time</th>
                <th scope="col" className="py-2">Answer</th>
              </tr>
            </thead>
            <tbody>
              {choices.map((c) => {
                const l = toLocal(c.weekday, c.startHour, tz, weekStart);
                const later = shift ? toLocal(c.weekday, c.startHour, tz, shift.fromWeek) : null;
                return (
                  <tr key={slotKey(c.weekday, c.startHour)} className="border-b border-line">
                    <td className="py-2 pr-3">
                      {slotRangeLabel(c.weekday, c.startHour)} {l.refAbbrev}
                    </td>
                    <td className="py-2 pr-3">
                      {l.localTime}–{l.localEndTime}
                      {formatDayOffset(l.dayOffset)}
                      {later && (
                        <span className="block text-xs text-muted">
                          from {shift!.fromWeek.toFormat("d LLL")}: {later.localTime}–{later.localEndTime}
                        </span>
                      )}
                    </td>
                    <td className="py-2">
                      <span aria-hidden="true">{c.preference === "available" ? "✓ " : "~ "}</span>
                      {PREFERENCE_LABEL[c.preference]}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <DstNotice shift={shift} timeZone={tz} />
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md border border-brand bg-white px-4 py-2 font-semibold text-brand hover:bg-blue-50"
        >
          Edit my response
        </button>
        <Link href="/results" className="rounded-md bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark">
          See group results
        </Link>
      </div>
    </div>
  );
}
