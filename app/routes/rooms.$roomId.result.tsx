/**
 * /rooms/:roomId/result - 結果画面
 * AC-4: ゲーム終了後に全プレイヤーの 5 枚を一覧表示
 * AC-4: URL シェア可（SSR でデータを持つ）
 * AC-5: レスポンシブ対応
 */
import { data, redirect } from "react-router";
import type { Route } from "./+types/rooms.$roomId.result";
import { requireUser } from "~/lib/session.server";
import { drizzle } from "drizzle-orm/d1";
import { and, eq } from "drizzle-orm";
import * as schema from "../../db/schema";

export function meta() {
  return [{ title: `結果 - Align` }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const user = await requireUser(request, context);
  const { roomId } = params;

  const db = drizzle(context.cloudflare.env.DB, { schema });

  const room = await db.query.rooms.findFirst({
    where: (r, { eq }) => eq(r.id, roomId),
    with: { space: true },
  });

  if (!room) {
    throw new Response("Not Found", { status: 404 });
  }

  // finished でなければ適切な画面にリダイレクト
  if (room.status === "waiting") {
    throw redirect(`/rooms/${roomId}`);
  }
  if (room.status === "playing") {
    throw redirect(`/rooms/${roomId}/play`);
  }

  // スペースメンバーチェック
  const membership = await db.query.spaceMembers.findFirst({
    where: (m, { and, eq }) =>
      and(eq(m.spaceId, room.spaceId), eq(m.userId, user.id)),
  });

  if (!membership) {
    throw new Response("Forbidden", { status: 403 });
  }

  // プレイヤー一覧（seatOrder 順）
  const players = await db.query.roomPlayers.findMany({
    where: (rp, { eq }) => eq(rp.roomId, roomId),
    orderBy: (rp, { asc }) => asc(rp.seatOrder),
  });

  // 全プレイヤーの hand カードを取得
  const result = await Promise.all(
    players.map(async (player) => {
      const handCards = await db
        .select({
          cardId: schema.roomCards.cardId,
          cardText: schema.cards.text,
          position: schema.roomCards.position,
        })
        .from(schema.roomCards)
        .innerJoin(schema.cards, eq(schema.roomCards.cardId, schema.cards.id))
        .where(
          and(
            eq(schema.roomCards.roomId, roomId),
            eq(schema.roomCards.location, "hand"),
            eq(schema.roomCards.ownerPlayerId, player.id),
          ),
        )
        .orderBy(schema.roomCards.position);

      return {
        playerId: player.id,
        playerName: player.name,
        isMe: player.userId === user.id,
        seatOrder: player.seatOrder,
        hand: handCards,
      };
    }),
  );

  return data({
    room,
    players: result,
    shareUrl: new URL(request.url).toString(),
  });
}

export default function ResultPage({ loaderData }: Route.ComponentProps) {
  const { room, players, shareUrl } = loaderData;

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl).catch(() => {
        // clipboard 失敗時は無視
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-8 px-4">
        {/* ヘッダー */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            ゲーム終了！
          </h1>
          <p className="text-gray-600 text-sm">
            {room.space?.name ?? "Align"} - 最終結果
          </p>
          <button
            type="button"
            onClick={handleShare}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors"
          >
            結果 URL をコピー
          </button>
        </div>

        {/* プレイヤーごとの結果 */}
        <div className="grid gap-6 sm:grid-cols-2">
          {players.map((player) => (
            <div
              key={player.playerId}
              className={`bg-white rounded-xl shadow p-5 ${
                player.isMe ? "ring-2 ring-indigo-400" : ""
              }`}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm flex-shrink-0">
                  {player.playerName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900">
                    {player.playerName}
                    {player.isMe && (
                      <span className="ml-2 text-xs font-normal text-gray-400">
                        （あなた）
                      </span>
                    )}
                  </h2>
                  {player.seatOrder !== null && (
                    <p className="text-xs text-gray-400">
                      席順 {player.seatOrder + 1}
                    </p>
                  )}
                </div>
              </div>

              {/* 手札カード一覧 */}
              {player.hand.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">
                  カードなし
                </p>
              ) : (
                <ol className="space-y-2">
                  {player.hand.map((card, idx) => (
                    <li
                      key={card.cardId}
                      className="flex gap-3 items-start p-2 rounded-lg bg-gray-50"
                    >
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">
                        {idx + 1}
                      </span>
                      <span className="text-sm text-gray-800 leading-relaxed">
                        {card.cardText}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </div>

        {/* ロビーへのリンク */}
        <div className="text-center mt-10">
          <a
            href="/rooms"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
          >
            ルーム一覧に戻る
          </a>
        </div>
      </div>
    </div>
  );
}
