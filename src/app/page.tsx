import ParticipantApp from "@/components/ParticipantApp";
import { getDb } from "@/lib/db";
import { ensurePoll } from "@/lib/repo";
import { countryOptions } from "@/lib/countries";

export const dynamic = "force-dynamic";

export default async function Home() {
  const poll = await ensurePoll(getDb());
  return (
    <ParticipantApp
      pollId={poll.id}
      nowIso={new Date().toISOString()}
      deadlineAt={poll.deadlineAt}
      closed={poll.closed}
      countries={countryOptions()}
    />
  );
}
