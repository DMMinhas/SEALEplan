import type { Metadata } from "next";
import ResultsView from "@/components/ResultsView";
import { getDb } from "@/lib/db";
import { buildPublicResults } from "@/lib/results";
import { pollConfig } from "@/config/poll.config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `Group results – ${pollConfig.title}` };

export default async function ResultsPage() {
  const data = await buildPublicResults(getDb());
  return <ResultsView data={data} nowIso={new Date().toISOString()} />;
}
