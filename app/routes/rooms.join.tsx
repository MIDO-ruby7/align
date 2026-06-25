import { redirect, data } from "react-router";
import { Form, useNavigation } from "react-router";
import type { Route } from "./+types/rooms.join";
import { requireUser } from "~/lib/session.server";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema";
import { broadcastRoomEvent } from "~/lib/broadcast.server";

export function meta() {
  return [{ title: "ルームに参加 - Align" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  return { user };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const formData = await request.formData();
  const inviteCode = formData.get("inviteCode");
  const playerName = formData.get("playerName");

  if (typeof inviteCode !== "string" || !inviteCode.trim()) {
    return data({ error: "招待コードを入力してください" }, { status: 400 });
  }

  if (typeof playerName !== "string" || !playerName.trim()) {
    return data({ error: "プレイヤー名を入力してください" }, { status: 400 });
  }

  if (playerName.trim().length > 50) {
    return data({ error: "プレイヤー名は50文字以内で入力してください" }, { status: 400 });
  }

  const db = drizzle(context.cloudflare.env.DB, { schema });

  // 招待コードでルームを検索
  const room = await db.query.rooms.findFirst({
    where: (r, { eq }) => eq(r.inviteCode, inviteCode.trim().toUpperCase()),
    with: { space: true },
  });

  if (!room) {
    return data({ error: "招待コードが正しくないか、参加権限がありません" }, { status: 400 });
  }

  // スペースメンバーチェック
  const membership = await db.query.spaceMembers.findFirst({
    where: (m, { and, eq }) =>
      and(eq(m.spaceId, room.spaceId), eq(m.userId, user.id)),
  });

  if (!membership) {
    return data({ error: "招待コードが正しくないか、参加権限がありません" }, { status: 400 });
  }

  // ルームのステータスチェック
  if (room.status !== "waiting") {
    return data({ error: "このルームはすでに開始されています" }, { status: 400 });
  }

  // 現在のプレイヤー数チェック
  const currentPlayers = await db.query.roomPlayers.findMany({
    where: (rp, { eq }) => eq(rp.roomId, room.id),
  });

  if (currentPlayers.length >= 8) {
    return data({ error: "ルームは最大8人までです" }, { status: 409 });
  }

  // 名前の重複チェック
  const nameDuplicate = currentPlayers.some(
    (p) => p.name.toLowerCase() === playerName.trim().toLowerCase(),
  );

  if (nameDuplicate) {
    return data(
      { error: "このルームで同じ名前のプレイヤーがすでに参加しています" },
      { status: 409 },
    );
  }

  // すでに参加しているかチェック
  const alreadyJoined = currentPlayers.some((p) => p.userId === user.id);
  if (alreadyJoined) {
    throw redirect(`/rooms/${room.id}`);
  }

  const now = new Date();
  const newPlayerId = crypto.randomUUID();
  await db.insert(schema.roomPlayers).values({
    id: newPlayerId,
    roomId: room.id,
    userId: user.id,
    name: playerName.trim(),
    seatOrder: currentPlayers.length + 1,
    joinedAt: now,
  });

  const updatedPlayers = await db.query.roomPlayers.findMany({
    where: (rp, { eq }) => eq(rp.roomId, room.id),
    orderBy: (rp, { asc }) => asc(rp.seatOrder),
  });
  await broadcastRoomEvent(context.cloudflare.env, room.id, {
    type: "room.updated",
    roomId: room.id,
    players: updatedPlayers.map((p) => ({
      id: p.id,
      userId: p.userId,
      name: p.name,
      seatOrder: p.seatOrder,
    })),
  });

  throw redirect(`/rooms/${room.id}`);
}

export default function RoomsJoin({ loaderData, actionData }: Route.ComponentProps) {
  const { user } = loaderData;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="min-h-screen bg-[#f9f9f7]">
      <div className="max-w-lg mx-auto px-4 py-8">
        {/* 戻るリンク */}
        <a
          href="/spaces"
          className="text-[#880069] text-sm flex items-center gap-1 mb-6 hover:underline font-medium"
        >
          &larr; スペース一覧に戻る
        </a>

        <h1
          className="text-2xl font-bold text-[#1a1c1b] mb-1"
          style={{ fontFamily: "Quicksand" }}
        >
          ルームに参加
        </h1>
        <p className="text-[#1a1c1b]/50 text-sm mb-6">招待コードを入力してゲームに参加します</p>

        {actionData?.error && (
          <div className="bg-red-50 border-2 border-red-400 text-red-700 px-4 py-3 rounded-xl mb-4">
            {actionData.error}
          </div>
        )}

        <div className="bg-white border-4 border-[#1a1c1b] rounded-2xl neo-shadow-lg p-6">
          <Form method="post" className="space-y-4">
            {/* 招待コード */}
            <div>
              <label
                htmlFor="inviteCode"
                className="block text-sm font-bold text-[#1a1c1b] mb-1"
              >
                招待コード
              </label>
              <input
                id="inviteCode"
                name="inviteCode"
                type="text"
                required
                maxLength={6}
                placeholder="ABC123"
                className="block w-full px-4 py-3 border-2 border-[#1a1c1b] rounded-full focus:outline-none focus:border-[#880069] uppercase tracking-widest font-bold text-center text-lg"
                style={{ textTransform: "uppercase", fontFamily: "Quicksand" }}
              />
              <p className="mt-1 text-xs text-[#1a1c1b]/40">6文字の英数字</p>
            </div>

            {/* 表示名 */}
            <div>
              <label
                htmlFor="playerName"
                className="block text-sm font-bold text-[#1a1c1b] mb-1"
              >
                あなたの表示名
              </label>
              <input
                id="playerName"
                name="playerName"
                type="text"
                required
                maxLength={50}
                defaultValue={user.name}
                className="block w-full px-4 py-3 border-2 border-[#1a1c1b] rounded-full focus:outline-none focus:border-[#880069] font-medium"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex justify-center py-3.5 px-4 bg-[#880069] border-4 border-[#1a1c1b] rounded-full font-bold text-white neo-shadow-lg neo-shadow-lg-active transition-all disabled:opacity-50"
            >
              {isSubmitting ? "参加中..." : "ルームに参加する"}
            </button>
          </Form>
        </div>

        <div className="bg-white border-4 border-[#1a1c1b] rounded-2xl neo-shadow p-5 mt-4">
          <h3
            className="text-sm font-bold text-[#1a1c1b] mb-3"
            style={{ fontFamily: "Quicksand" }}
          >
            ゲームの流れ
          </h3>
          <ol className="space-y-3">
            {[
              { step: "1", text: "招待コードを入力" },
              { step: "2", text: "ゲームに参加" },
              { step: "3", text: "カードを選ぶ" },
              { step: "4", text: "価値観を共有" },
            ].map(({ step, text }) => (
              <li key={step} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#880069] text-white text-xs flex items-center justify-center font-bold">
                  {step}
                </span>
                <span className="text-sm text-[#1a1c1b]/70 mt-0.5">{text}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
