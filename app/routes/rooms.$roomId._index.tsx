import { data, redirect } from "react-router";
import { Form, useNavigation } from "react-router";
import { useState } from "react";
import { Copy, Check } from "lucide-react";
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
  const [inviteCopied, setInviteCopied] = useState(false);

  const handleCopyInviteCode = () => {
    navigator.clipboard?.writeText(room.inviteCode).then(() => {
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    }).catch(() => {});
  };

  // 招待コードを空白区切りで見やすく表示 (例: "739 421")
  const formattedCode = room.inviteCode
    .split("")
    .map((c, i) => (i === 3 ? ` ${c}` : c))
    .join("");

  return (
    <div className="min-h-screen bg-[#f9f9f7]">
      {/* ヘッダー */}
      <header className="bg-white border-b-4 border-[#1a1c1b]">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <a
              href="/spaces"
              className="text-lg font-black text-[#880069]"
              style={{ fontFamily: "Quicksand" }}
            >
              Align
            </a>
            {room.space && (
              <div className="flex items-center gap-1 text-xs text-[#1a1c1b]/50 mt-0.5">
                <a
                  href={`/spaces/${room.spaceId}`}
                  className="hover:text-[#880069]"
                >
                  {room.space.name}
                </a>
                <span>&rsaquo;</span>
                <span>ゲームロビー</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto py-6 px-4 space-y-6">
        {/* 招待コードセクション */}
        <div className="text-center">
          <p
            className="text-xs font-bold text-[#1a1c1b]/50 uppercase tracking-widest mb-3"
            style={{ fontFamily: "Quicksand" }}
          >
            INVITE YOUR FRIENDS
          </p>
          <div className="bg-[#e7e482] border-4 border-[#1a1c1b] rounded-3xl px-8 py-5 neo-shadow-lg inline-block w-full max-w-xs">
            <p
              className="text-5xl font-black text-[#1a1c1b] tracking-[0.2em]"
              style={{ fontFamily: "Quicksand" }}
            >
              {formattedCode}
            </p>
            <button
              type="button"
              onClick={handleCopyInviteCode}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-[#1a1c1b]/70 hover:text-[#1a1c1b] transition-colors"
            >
              {inviteCopied ? (
                <>
                  <Check size={14} />
                  Copied!
                </>
              ) : (
                <>
                  <Copy size={14} />
                  Copy Code
                </>
              )}
            </button>
          </div>
        </div>

        {/* エラーメッセージ */}
        {actionData && "error" in actionData && actionData.error && (
          <div className="bg-red-50 border-2 border-red-400 text-red-700 px-4 py-3 rounded-xl">
            {actionData.error}
          </div>
        )}

        {/* 参加者一覧 */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2
              className="text-xl font-black text-[#1a1c1b]"
              style={{ fontFamily: "Quicksand" }}
            >
              Joined Players
            </h2>
            <span className="bg-white border-2 border-[#1a1c1b] rounded-full px-3 py-1 text-sm font-bold text-[#1a1c1b]">
              {players.length}/8
            </span>
          </div>

          {players.length === 0 ? (
            <div className="flex items-center gap-3 bg-white/50 border-2 border-[#1a1c1b]/30 rounded-full px-4 py-3">
              <div className="w-8 h-8 rounded-full border-2 border-[#1a1c1b]/20 flex items-center justify-center">
                <span className="text-[#1a1c1b]/30 text-lg">+</span>
              </div>
              <span className="text-sm text-[#1a1c1b]/40 font-medium">Waiting...</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {players.map((player) => {
                const isMe = player.userId === user.id;
                const isPlayerHost = player.userId === room.hostUserId;
                return (
                  <div
                    key={player.id}
                    className="flex items-center gap-3 bg-white border-2 border-[#1a1c1b] rounded-full px-4 py-2 neo-shadow"
                  >
                    <div className="w-8 h-8 rounded-full bg-[#ff71ce] border-2 border-[#1a1c1b] flex items-center justify-center text-sm font-black text-[#1a1c1b] flex-shrink-0">
                      {player.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-[#1a1c1b] truncate">
                        {player.name}
                        {isPlayerHost && (
                          <span className="ml-1 text-[10px] text-[#880069]">(Host)</span>
                        )}
                      </p>
                      {isMe ? (
                        <p className="text-xs text-[#00bd76] font-bold flex items-center gap-0.5">
                          <span>&#10003;</span> Ready
                        </p>
                      ) : (
                        <p className="text-xs text-[#1a1c1b]/40 font-medium">
                          Thinking...
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 待機スロット */}
          {players.length > 0 && players.length < 8 && (
            <div className="mt-2 flex items-center gap-3 bg-white/40 border-2 border-[#1a1c1b]/20 rounded-full px-4 py-2.5">
              <div className="w-8 h-8 rounded-full border-2 border-[#1a1c1b]/20 flex items-center justify-center">
                <span className="text-[#1a1c1b]/30 text-base leading-none">+</span>
              </div>
              <span className="text-sm text-[#1a1c1b]/40 font-medium">Waiting...</span>
            </div>
          )}
        </div>

        {/* 非ホスト待機案内 */}
        {!isHost && room.status === "waiting" && (
          <div className="bg-white border-2 border-[#1a1c1b] rounded-full px-5 py-3 text-center neo-shadow">
            <p className="text-sm text-[#1a1c1b] font-medium flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#00bd76] inline-block"></span>
              Ready! Waiting for {hostUser?.name ?? "host"} to start.
            </p>
          </div>
        )}

        {/* ゲーム開始ボタン（ホストのみ） */}
        {isHost && room.status === "waiting" && (
          <Form method="post">
            <input type="hidden" name="intent" value="start" />
            <button
              type="submit"
              disabled={isStarting || players.length < 1}
              className="w-full py-5 bg-[#ff71ce] border-4 border-[#1a1c1b] rounded-full font-black text-[#1a1c1b] text-xl neo-shadow-lg hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[6px_6px_0px_0px_#1a1c1b] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ fontFamily: "Quicksand" }}
            >
              {isStarting ? "Starting..." : "Start Game"}
            </button>
          </Form>
        )}

        {/* ゲーム中の表示 */}
        {room.status === "playing" && (
          <div className="bg-[#00bd76] border-4 border-[#1a1c1b] rounded-2xl neo-shadow p-6 text-center">
            <p className="text-white font-black text-lg" style={{ fontFamily: "Quicksand" }}>
              ゲームが開始されました！
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
