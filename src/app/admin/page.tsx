import type { Metadata } from "next";
import { cookies } from "next/headers";
import AdminDashboard from "@/components/AdminDashboard";
import { ADMIN_COOKIE, verifySessionValue } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const session = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!(await verifySessionValue(session))) {
    return (
      <div role="alert" className="max-w-xl rounded-md border border-red-800 bg-red-50 p-4 text-red-950">
        <h1 className="text-lg font-bold">Admin access required</h1>
        <p className="mt-1">
          {params.denied
            ? "That admin link is not valid."
            : "Open the secret admin link (…/admin?token=…) to sign in. Sessions last 12 hours."}
        </p>
      </div>
    );
  }
  return <AdminDashboard nowIso={new Date().toISOString()} />;
}
