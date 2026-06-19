import { data, redirect } from "react-router";
import { Form, useNavigation } from "react-router";
import type { Route } from "./+types/rooms.$roomId._index";
import { requireUser } from "~/lib/session.server";
import { drizzle } from "drizzle-orm/d1";
import { and, eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { secureShuffleSlice, distributeInitialHands, assignSeatOrders } from "~/lib/game-logic";
import { broadcastRoomEvent } from "~/lib/broadcast.server";

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

  // ゲーム開始済みなら自動でゲーム画面へ
  if (room.status === "playing") {
    throw redirect(`/rooms/${roomId}/play`);
  }
  if (room.status === "finished") {
    throw redirect(`/rooms/${roomId}/result`);
  }

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
    return data({ error: "ゲームはすでに開始されています" }, { status: 409 });
  }

  // プレイヤー取得
  const players = await db.query.roomPlayers.findMany({
    where: (rp, { eq }) => eq(rp.roomId, roomId),
  });

  if (players.length < 1) {
    return data({ error: "プレイヤーが1人以上必要です" }, { status: 400 });
  }

  // スペースのアクティブカードを取得
  const activeCards = await db.query.cards.findMany({
    where: (c, { and, eq }) =>
      and(eq(c.spaceId, room.spaceId), eq(c.isActive, true)),
  });

  if (activeCards.length === 0) {
    return data(
      { error: "スペースにアクティブなカードがありません" },
      { status: 400 },
    );
  }

  const deckSize = Math.min(room.deckSize, activeCards.length);

  // セキュアシャッフルで deck_size 枚をサンプリング
  const deckCards = secureShuffleSlice(activeCards, deckSize);

  // seat_order をランダムに確定
  const playersWithSeats = assignSeatOrders(players);

  // 各プレイヤーに初期 5 枚を配布（deck から先頭を取り出す）
  const INITIAL_HAND_SIZE = 5;
  const handDistribution = distributeInitialHands(
    playersWithSeats,
    deckCards,
    INITIAL_HAND_SIZE,
  );

  // hand に配布したカードの ID セット
  const handCardIds = new Set(
    Object.values(handDistribution).flat().map((c) => c.id),
  );

  // deck に残るカード（hand に配布していないもの）
  const remainingDeckCards = deckCards.filter((c) => !handCardIds.has(c.id));

  // --- DB書き込み ---

  // 1. seat_order を更新
  for (const p of playersWithSeats) {
    await db
      .update(schema.roomPlayers)
      .set({ seatOrder: p.seatOrder })
      .where(
        and(
          eq(schema.roomPlayers.id, p.id),
          eq(schema.roomPlayers.roomId, roomId),
        ),
      );
  }

  // 2. room_cards に deck カードを投入（deck の残り）
  if (remainingDeckCards.length > 0) {
    await db.insert(schema.roomCards).values(
      remainingDeckCards.map((card, idx) => ({
        roomId,
        cardId: card.id,
        location: "deck" as const,
        ownerPlayerId: null,
        position: idx,
      })),
    );
  }

  // 3. 各プレイヤーの hand カードを投入
  for (const [playerId, cards] of Object.entries(handDistribution)) {
    if (cards.length === 0) continue;
    await db.insert(schema.roomCards).values(
      cards.map((card, idx) => ({
        roomId,
        cardId: card.id,
        location: "hand" as const,
        ownerPlayerId: playerId,
        position: idx,
      })),
    );
  }

  // 4. rooms.status を 'playing' に更新
  await db
    .update(schema.rooms)
    .set({ status: "playing" })
    .where(eq(schema.rooms.id, roomId));

  const seatOrderInfo = playersWithSeats.map((p) => ({
    playerId: p.id,
    seatOrder: p.seatOrder,
  }));
  await broadcastRoomEvent(context.cloudflare.env, roomId, {
    type: "game.started",
    roomId,
    seatOrder: seatOrderInfo,
    deckCount: remainingDeckCards.length,
    handCount: INITIAL_HAND_SIZE,
  });

  throw redirect(`/rooms/${roomId}/play`);
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

  const handleCopyInviteCode = () => {
    navigator.clipboard.writeText(room.inviteCode).catch(() => {});
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <a href="/spaces" className="text-lg font-bold text-indigo-600">
              Align
            </a>
            {/* パンくず */}
            {room.space && (
              <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                <a href={`/spaces/${room.spaceId}`} className="hover:text-indigo-600">
                  {room.space.name}
                </a>
                <span>&rsaquo;</span>
                <span>ゲームロビー</span>
              </div>
            )}
          </div>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusColor}`}>
            {statusLabel}
          </span>
        </div>
      </header>

      <div className="max-w-2xl mx-auto py-6 px-4 space-y-4">
        {/* ルーム情報 */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {room.space?.name ?? "ゲームロビー"}
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                ホスト: {hostUser?.name ?? "不明"}
              </p>
            </div>
          </div>

          {/* 招待コード */}
          <div className="bg-indigo-50 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-indigo-500 font-medium mb-1">招待コード</p>
              <p className="text-3xl font-mono font-bold text-indigo-700 tracking-widest">
                {room.inviteCode}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyInviteCode}
              className="ml-4 px-3 py-2 bg-white border border-indigo-200 rounded-lg text-sm text-indigo-600 font-medium hover:bg-indigo-50 transition-colors"
            >
              コピー
            </button>
          </div>

          <div className="mt-3 text-sm text-gray-500">
            参加人数: <span className="font-semibold text-gray-800">{players.length}</span> / 8
          </div>
        </div>

        {/* エラーメッセージ */}
        {actionData && "error" in actionData && actionData.error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {actionData.error}
          </div>
        )}

        {/* 参加者一覧 */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-3">
            参加者一覧
          </h2>
          {players.length === 0 ? (
            <p className="text-gray-400 text-sm">参加者はまだいません</p>
          ) : (
            <ul className="space-y-2">
              {players.map((player) => (
                <li
                  key={player.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-gray-50"
                >
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm flex-shrink-0">
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <span className="text-gray-900 font-medium">
                      {player.name}
                    </span>
                    {player.userId === user.id && (
                      <span className="ml-2 text-xs text-gray-400">（あなた）</span>
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
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-1">
              ゲーム操作
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              全員が参加したらゲームを開始してください。
            </p>
            <Form method="post">
              <input type="hidden" name="intent" value="start" />
              <button
                type="submit"
                disabled={isStarting || players.length < 1}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-green-600 hover:bg-green-700 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isStarting ? "開始中..." : "ゲームを開始する"}
              </button>
            </Form>
          </div>
        )}

        {/* ゲーム中の表示 */}
        {room.status === "playing" && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
            <p className="text-green-800 font-semibold text-lg">
              ゲームが開始されました！
            </p>
            <p className="text-green-600 text-sm mt-1">
              ゲーム機能（ドロー・ディスカード）が有効です
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
