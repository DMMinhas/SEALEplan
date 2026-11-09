import { ADMIN_COOKIE } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Set-Cookie": `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
      "Cache-Control": "no-store",
    },
  });
}
