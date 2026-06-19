import { data } from "react-router";
import { Form, useNavigation } from "react-router";
import type { Route } from "./+types/rooms.$roomId._index";
import { requireUser } from "~/lib/session.server";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";

export function meta() {
  return [{ title: `ロビー - Align` }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const { roomId } = params;

  const db = drizzle(context.cloudflare.env.DB, { schema });

  const room = await db.query.rooms.findFirst({
    where: (r, { eq }) => eq(r.id, roomId),
    with: {
      space: true,
    },
  });

  if (!room) {
    throw new Response("Not Found", { status: 404 });
  }

  // スペースメンバーチェック
  const membership = await db.query.spaceMembers.findFirst({
    where: (m, { and, eq }) =>
      and(eq(m.spaceId, room.spaceId), eq(m.userId, user.id)),
  });

  if (!membership) {
    throw new Response("Forbidden", { status: 403 });
  }

  const players = await db.query.roomPlayers.findMany({
    where: (rp, { eq }) => eq(rp.roomId, roomId),
    orderBy: (rp, { asc }) => [asc(rp.seatOrder), asc(rp.joinedAt)],
  });

  // ホストユーザー情報を取得
  const hostUser = await db.query.user.findFirst({
    where: (u, { eq }) => eq(u.id, room.hostUserId),
  });

  const isHost = room.hostUserId === user.id;

  return {
    user,
    room,
    players,
    hostUser,
    isHost,
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const user = await requireUser(request, context);
  const { roomId } = params;
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent !== "start") {
    return data({ error: "不正なリクエストです" }, { status: 400 });
  }

  const db = drizzle(context.cloudflare.env.DB, { schema });

  const room = await db.query.rooms.findFirst({
    where: (r, { eq }) => eq(r.id, roomId),
  });

  if (!room) {
    return data({ error: "ルームが見つかりません" }, { status: 404 });
  }

  // ホストチェック
  if (room.hostUserId !== user.id) {
    return data({ error: "ホストのみゲームを開始できます" }, { status: 403 });
  }

  // ステータスチェック
  if (room.status !== "waiting") {
    return data({ error: "ゲームはすでに開始されています" }, { status: 400 });
  }

  // プレイヤー数チェック
  const players = await db.query.roomPlayers.findMany({
    where: (rp, { eq }) => eq(rp.roomId, roomId),
  });

  if (players.length < 1) {
    return data({ error: "プレイヤーが1人以上必要です" }, { status: 400 });
  }

  await db
    .update(schema.rooms)
    .set({ status: "playing" })
    .where(eq(schema.rooms.id, roomId));

  // ページをリロードしてステータスを反映
  return data({ success: true });
}

export default function RoomLobby({ loaderData, actionData }: Route.ComponentProps) {
  const { user, room, players, hostUser, isHost } = loaderData;
  const navigation = useNavigation();
  const isStarting = navigation.state === "submitting";

  const statusLabel =
    room.status === "waiting"
      ? "待機中"
      : room.status === "playing"
        ? "プレイ中"
        : "終了";

  const statusColor =
    room.status === "waiting"
      ? "bg-yellow-100 text-yellow-800"
      : room.status === "playing"
        ? "bg-green-100 text-green-800"
        : "bg-gray-100 text-gray-800";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="mb-6">
          <a href="/rooms" className="text-sm text-indigo-600 hover:underline">
            &larr; ルーム一覧に戻る
          </a>
        </div>

        {/* ルーム情報 */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {room.space?.name ?? "ゲームロビー"}
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                ホスト: {hostUser?.name ?? "不明"}
              </p>
            </div>
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusColor}`}
            >
              {statusLabel}
            </span>
          </div>

          <div className="mt-4 flex items-center gap-4">
            <div>
              <p className="text-xs text-gray-500">招待コード</p>
              <p className="text-xl font-mono font-bold text-indigo-600 tracking-widest">
                {room.inviteCode}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">参加人数</p>
              <p className="text-xl font-bold text-gray-900">
                {players.length} / 8
              </p>
            </div>
          </div>
        </div>

        {/* エラー/成功メッセージ */}
        {actionData && "error" in actionData && actionData.error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {actionData.error}
          </div>
        )}

        {/* 参加者一覧 */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            参加者一覧
          </h2>
          {players.length === 0 ? (
            <p className="text-gray-500 text-sm">参加者はまだいません</p>
          ) : (
            <ul className="space-y-2">
              {players.map((player) => (
                <li
                  key={player.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-gray-50"
                >
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm">
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <span className="text-gray-900 font-medium">
                      {player.name}
                    </span>
                    {player.userId === user.id && (
                      <span className="ml-2 text-xs text-gray-500">（あなた）</span>
                    )}
                  </div>
                  {player.userId === room.hostUserId && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                      ホスト
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ゲーム開始ボタン（ホストのみ） */}
        {isHost && room.status === "waiting" && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              ゲーム操作
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              全員が参加したらゲームを開始してください。
            </p>
            <Form method="post">
              <input type="hidden" name="intent" value="start" />
              <button
                type="submit"
                disabled={isStarting || players.length < 1}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isStarting ? "開始中..." : "ゲームを開始する"}
              </button>
            </Form>
          </div>
        )}

        {/* ゲーム中の表示 */}
        {room.status === "playing" && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
            <p className="text-green-800 font-semibold text-lg">
              ゲームが開始されました！
            </p>
            <p className="text-green-600 text-sm mt-1">
              ゲーム機能は実装中です（T6）
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
