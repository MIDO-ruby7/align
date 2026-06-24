import { redirect } from "react-router";
import type { Route } from "./+types/spaces.$spaceId.join";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema";
import { getOptionalUser } from "~/lib/session.server";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) throw new Response("Invalid invite link", { status: 404 });

  const db = drizzle(context.cloudflare.env.DB, { schema });
  const space = await db.query.spaces.findFirst({
    where: (s, { eq }) => eq(s.inviteToken, token),
  });

  if (!space || space.id !== params.spaceId) {
    throw new Response("Invalid or expired invite link", { status: 404 });
  }

  // 未ログインチェック
  const user = await getOptionalUser(request, context);
  if (!user) {
    throw redirect(`/login?redirect=/spaces/${params.spaceId}/join?token=${token}`);
  }

  // 既にメンバーか確認
  const existing = await db.query.spaceMembers.findFirst({
    where: (m, { and, eq }) => and(eq(m.spaceId, space.id), eq(m.userId, user.id)),
  });
  if (existing) throw redirect(`/spaces/${space.id}`);

  // メンバー追加
  await db.insert(schema.spaceMembers).values({
    spaceId: space.id,
    userId: user.id,
    role: "member",
    joinedAt: new Date(),
  });

  throw redirect(`/spaces/${space.id}`);
}

export default function JoinSpace() {
  return <div>スペースに参加中...</div>;
}
