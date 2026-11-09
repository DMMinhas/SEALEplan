/**
 * ~30 fictional respondents for testing the heatmap and admin ranking.
 * All names and organizations are invented ("(demo)").
 *
 * Availability notation (Berlin time, CET/CEST):
 *   "Mo-We 9-12"  → Mon, Tue, Wed; blocks starting 09, 10, 11
 *   "Tu,Th 9-17"  → Tue and Thu; blocks 09 … 16
 *   segments separated by ";"
 * `a` = Available, `i` = If needed. Anything else = unavailable.
 */
import type { SlotChoice } from "@/lib/grid";

export interface SeedRespondent {
  name: string;
  organization: string;
  country: string;
  timezone: string;
  a: string;
  i: string;
}

const DE = (name: string, organization: string, a: string, i: string): SeedRespondent => ({
  name, organization, country: "DE", timezone: "Europe/Berlin", a, i,
});
const PK = (name: string, organization: string, a: string, i: string): SeedRespondent => ({
  name, organization, country: "PK", timezone: "Asia/Karachi", a, i,
});
const NP = (name: string, organization: string, a: string, i: string): SeedRespondent => ({
  name, organization, country: "NP", timezone: "Asia/Kathmandu", a, i,
});
const KH = (name: string, organization: string, a: string, i: string): SeedRespondent => ({
  name, organization, country: "KH", timezone: "Asia/Phnom_Penh", a, i,
});

const HN = "Hochschule Nordstadt (demo)";
const UR = "Universität Rheinfeld (demo)";
const EC = "EduConsult Berlin GmbH (demo)";
const IV = "Indus Valley University (demo)";
const KP = "Karakoram Polytechnic (demo)";
const PI = "Punjab Institute of Applied Sciences (demo)";
const HC = "Himalaya College of Engineering (demo)";
const KV = "Kathmandu Valley Institute (demo)";
const PT = "Pokhara Technical University (demo)";
const MU = "Mekong University (demo)";
const AI = "Angkor Institute of Technology (demo)";
const BP = "Battambang Polytechnic (demo)";

export const SEED_RESPONDENTS: SeedRespondent[] = [
  /*  1 */ DE("Anna Becker", HN, "Mo-Fr 9-17", ""),
  /*  2 */ DE("Jonas Weber", HN, "Mo-We 9-12; Th-Fr 13-17", "Th-Fr 9-12"),
  /*  3 */ DE("Lea Hoffmann", HN, "Tu,Th 9-17", "Mo,We 9-12"),
  /*  4 */ DE("Felix Schulz", UR, "Mo-Fr 10-12", "Mo-Fr 14-16"),
  /*  5 */ DE("Mia Wagner", UR, "Mo-Th 9-11", "Fr 9-11"),
  /*  6 */ DE("Lukas Fischer", UR, "We-Fr 9-17", "Tu 9-12"),
  /*  7 */ DE("Sophie Klein", EC, "Tu-We 10-13", "Mo 9-17"),
  /*  8 */ DE("Paul Neumann", EC, "", "Mo-Fr 9-12"),
  /*  9 */ PK("Ayesha Khan", IV, "Mo-Th 9-13", "Mo-Th 13-15"),
  /* 10 */ PK("Bilal Ahmed", IV, "Tu-Th 9-12", "Mo 9-12"),
  /* 11 */ PK("Fatima Malik", IV, "Mo-Fr 9-11", "Mo-Fr 11-13"),
  /* 12 */ PK("Hassan Raza", KP, "Mo,We 10-13", "Tu 10-12"),
  /* 13 */ PK("Sana Iqbal", KP, "Tu-We 9-12", ""),
  /* 14 */ PK("Usman Tariq", KP, "Mo-Th 11-14", "Mo-Th 9-11"),
  /* 15 */ PK("Zainab Hussain", PI, "Tu,Th 9-12", "We 9-12"),
  /* 16 */ PK("Imran Sheikh", PI, "", ""),
  /* 17 */ NP("Aarav Shrestha", HC, "Mo-Fr 9-12", "Mo-Fr 12-14"),
  /* 18 */ NP("Sita Gurung", HC, "Tu-Th 9-11", "Mo 9-11"),
  /* 19 */ NP("Bikash Thapa", HC, "Mo-We 10-13", "Th 10-13"),
  /* 20 */ NP("Priya Adhikari", KV, "Tu,We 9-11", "Tu,We 11-13"),
  /* 21 */ NP("Rajesh Karki", KV, "Mo,Fr 9-12", "Tu 9-12"),
  /* 22 */ NP("Anjali Rai", KV, "We-Fr 9-12", ""),
  /* 23 */ NP("Suman Basnet", PT, "Mo-Th 9-10", "Mo-Th 10-12"),
  /* 24 */ KH("Sokha Chan", MU, "Mo-Fr 9-11", "Mo-Fr 11-12"),
  /* 25 */ KH("Dara Pich", MU, "Tu-Th 9-11", ""),
  /* 26 */ KH("Sreymom Keo", MU, "Mo,We 9-11", "Tu 9-11"),
  /* 27 */ KH("Vannak Sok", AI, "Tu 9-12", "We-Th 9-11"),
  /* 28 */ KH("Chantrea Lim", AI, "We-Fr 9-10", "Tu 9-10"),
  /* 29 */ KH("Rithy Meas", AI, "Mo-Th 10-11", "Fr 10-11"),
  /* 30 */ KH("Bopha Heng", BP, "", "Mo-Fr 9-11"),
];

const DAY: Record<string, number> = { Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6, Su: 7 };

function parseDays(spec: string): number[] {
  return spec.split(",").flatMap((part) => {
    const [from, to] = part.split("-");
    const a = DAY[from];
    const b = to ? DAY[to] : a;
    if (!a || !b) throw new Error(`Bad day spec: ${spec}`);
    return Array.from({ length: b - a + 1 }, (_, k) => a + k);
  });
}

function parseHours(spec: string): number[] {
  const [from, to] = spec.split("-").map(Number);
  const end = to ?? from + 1;
  return Array.from({ length: end - from }, (_, k) => from + k);
}

function parseAvailability(spec: string): { weekday: number; startHour: number }[] {
  return spec
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((seg) => {
      const [days, hours] = seg.split(/\s+/);
      return parseDays(days).flatMap((weekday) =>
        parseHours(hours).map((startHour) => ({ weekday, startHour })),
      );
    });
}

export function seedSlots(r: SeedRespondent): SlotChoice[] {
  const out = new Map<string, SlotChoice>();
  for (const s of parseAvailability(r.a)) {
    out.set(`${s.weekday}-${s.startHour}`, { ...s, preference: "available" });
  }
  for (const s of parseAvailability(r.i)) {
    const k = `${s.weekday}-${s.startHour}`;
    if (out.has(k)) throw new Error(`${r.name}: slot ${k} is both available and if-needed`);
    out.set(k, { ...s, preference: "if_needed" });
  }
  return [...out.values()].sort((x, y) => x.weekday - y.weekday || x.startHour - y.startHour);
}
