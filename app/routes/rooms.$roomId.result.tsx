/**
 * /rooms/:roomId/result - 結果画面
 * AC-4: ゲーム終了後に全プレイヤーの 5 枚を一覧表示
 * AC-4: URL シェア可（SSR でデータを持つ）
 * AC-5: レスポンシブ対応
 */
import { data, redirect } from "react-router";
import { useState } from "react";
import { Share2, LogOut } from "lucide-react";
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

// アバター背景色（プレイヤーインデックスでローテーション）
const avatarColors = [
  "bg-[#ff71ce]",
  "bg-[#e7e482]",
  "bg-[#9cf5be]",
  "bg-[#00bd76]",
];

// カードボーダー色（カードインデックスでローテーション）
const cardBorderColors = [
  "border-[#ff71ce]",
  "border-[#00bd76]",
  "border-[#e7e482]",
  "border-[#880069]",
];

export default function ResultPage({ loaderData }: Route.ComponentProps) {
  const { room, players, shareUrl } = loaderData;
  const [copied, setCopied] = useState(false);

  const handleShare = () => {
    navigator.clipboard?.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <div className="min-h-screen bg-[#f9f9f7]">
      <div className="max-w-2xl mx-auto py-8 px-4">
        {/* GAME OVER ヘッダー */}
        <div className="text-center mb-6">
          <div className="inline-block bg-[#880069] border-4 border-[#1a1c1b] rounded-full px-8 py-3 neo-shadow-lg mb-3">
            <h1
              className="text-3xl font-black text-white tracking-wide"
              style={{ fontFamily: "Quicksand" }}
            >
              GAME OVER
            </h1>
          </div>
          <p className="text-lg font-bold text-[#1a1c1b]">
            Fantastic effort, everyone!
          </p>
        </div>

        {/* プレイヤーごとの結果 */}
        <div className="space-y-4 mb-8">
          {players.map((player, playerIdx) => (
            <div
              key={player.playerId}
              className={`relative bg-white border-4 border-[#1a1c1b] rounded-2xl neo-shadow-lg p-5 ${
                player.isMe ? "ring-2 ring-[#880069] ring-offset-2" : ""
              }`}
            >
              {/* WINNER バッジ（1位のプレイヤーに表示） */}
              {playerIdx === 0 && (
                <div className="absolute -top-2 -right-2 bg-[#00bd76] border-2 border-[#1a1c1b] rounded-full px-3 py-1 neo-shadow">
                  <span className="text-white text-xs font-black">
                    &#9733; WINNER
                  </span>
                </div>
              )}

              {/* プレイヤー情報 */}
              <div className="flex items-center gap-3 mb-4">
                <div
                  className={`w-10 h-10 rounded-full border-2 border-[#1a1c1b] flex items-center justify-center font-black text-[#1a1c1b] flex-shrink-0 ${
                    avatarColors[playerIdx % avatarColors.length]
                  }`}
                >
                  {player.playerName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="font-black text-[#1a1c1b]" style={{ fontFamily: "Quicksand" }}>
                    {player.playerName}
                    {player.isMe && (
                      <span className="ml-2 text-xs font-normal text-[#1a1c1b]/40">
                        （あなた）
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-[#1a1c1b]/40">
                    {player.hand.length} 枚
                  </p>
                </div>
              </div>

              {/* 手札カード一覧（横並び小カード） */}
              {player.hand.length === 0 ? (
                <p className="text-sm text-[#1a1c1b]/40 text-center py-4">
                  カードなし
                </p>
              ) : (
                <div className="flex gap-2 flex-wrap">
                  {player.hand.map((card, cardIdx) => (
                    <div
                      key={card.cardId}
                      className={`border-2 rounded-xl px-3 py-2 bg-white flex-1 min-w-[80px] max-w-[120px] text-center neo-shadow ${
                        cardBorderColors[cardIdx % cardBorderColors.length]
                      }`}
                    >
                      <p className="text-xs font-bold text-[#1a1c1b] leading-tight">
                        {card.cardText}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* アクションボタン */}
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={handleShare}
            className="w-full flex items-center justify-center gap-2 py-4 bg-[#ff71ce] border-4 border-[#1a1c1b] rounded-full font-black text-[#1a1c1b] neo-shadow-lg hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[6px_6px_0px_0px_#1a1c1b] transition-all"
            style={{ fontFamily: "Quicksand" }}
          >
            <Share2 size={18} />
            {copied ? "コピーしました！" : "Share Results"}
          </button>
          <a
            href={`/spaces/${room.spaceId}`}
            className="w-full flex items-center justify-center gap-2 py-4 bg-white border-4 border-[#1a1c1b] rounded-full font-black text-[#1a1c1b] neo-shadow hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[2px_2px_0px_0px_#1a1c1b] transition-all"
            style={{ fontFamily: "Quicksand" }}
          >
            <LogOut size={18} />
            Back to Lobby
          </a>
        </div>
      </div>
    </div>
  );
}
