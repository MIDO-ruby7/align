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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-8">
        {/* 戻るリンク */}
        <a
          href="/spaces"
          className="text-indigo-600 text-sm flex items-center gap-1 mb-6 hover:underline"
        >
          &larr; スペース一覧に戻る
        </a>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">ルームに参加</h1>
        <p className="text-gray-500 text-sm mb-6">招待コードを入力してゲームに参加します</p>

        {actionData?.error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            {actionData.error}
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <Form method="post" className="space-y-4">
            {/* 招待コード */}
            <div>
              <label htmlFor="inviteCode" className="block text-sm font-medium text-gray-700 mb-1">
                招待コード
              </label>
              <input
                id="inviteCode"
                name="inviteCode"
                type="text"
                required
                maxLength={6}
                placeholder="ABC123"
                className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 uppercase tracking-widest font-mono text-center text-lg"
                style={{ textTransform: "uppercase" }}
              />
              <p className="mt-1 text-xs text-gray-400">6文字の英数字</p>
            </div>

            {/* 表示名 */}
            <div>
              <label htmlFor="playerName" className="block text-sm font-medium text-gray-700 mb-1">
                あなたの表示名
              </label>
              <input
                id="playerName"
                name="playerName"
                type="text"
                required
                maxLength={50}
                defaultValue={user.name}
                className="block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? "参加中..." : "ルームに参加する"}
            </button>
          </Form>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mt-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">ゲームの流れ</h3>
          <ol className="space-y-3">
            {[
              { step: "1", text: "招待コードを入力" },
              { step: "2", text: "ゲームに参加" },
              { step: "3", text: "カードを選ぶ" },
              { step: "4", text: "価値観を共有" },
            ].map(({ step, text }) => (
              <li key={step} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">
                  {step}
                </span>
                <span className="text-sm text-gray-600 mt-0.5">{text}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
