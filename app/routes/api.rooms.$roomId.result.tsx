/**
 * GET /api/rooms/:roomId/result
 * AC-6: 各プレイヤーの最終手札（hand）を取得
 */
import { data } from "react-router";
import type { LoaderFunctionArgs, AppLoadContext } from "react-router";
import { requireUser } from "~/lib/session.server";
import { drizzle } from "drizzle-orm/d1";
import { and, eq } from "drizzle-orm";
import * as schema from "../../db/schema";

type CloudflareLoaderArgs = LoaderFunctionArgs & {
  params: { roomId: string };
  context: AppLoadContext;
};

export async function loader({ request, context, params }: CloudflareLoaderArgs) {
  const user = await requireUser(request, context);
  const { roomId } = params;
  const db = drizzle((context.cloudflare as { env: { DB: D1Database } }).env.DB, { schema });

  // ルーム取得
  const room = await db.query.rooms.findFirst({
    where: (r, { eq }) => eq(r.id, roomId),
  });
  if (!room) return data({ error: "ルームが見つかりません" }, { status: 404 });

  // スペースメンバーチェック
  const membership = await db.query.spaceMembers.findFirst({
    where: (m, { and, eq }) =>
      and(eq(m.spaceId, room.spaceId), eq(m.userId, user.id)),
  });
  if (!membership) {
    return data({ error: "Forbidden" }, { status: 403 });
  }

  // ゲームが waiting 状態では結果取得不可
  if (room.status === "waiting") {
    return data({ error: "ゲームが開始されていません" }, { status: 409 });
  }

  // プレイヤー一覧
  const players = await db.query.roomPlayers.findMany({
    where: (rp, { eq }) => eq(rp.roomId, roomId),
    orderBy: (rp, { asc }) => asc(rp.seatOrder),
  });

  const currentPlayer = players.find((p) => p.userId === user.id);
  if (!currentPlayer) {
    return data({ error: "このルームに参加していません" }, { status: 403 });
  }

  if (room.status === "playing") {
    // playing 中は自分の手札のみ返す
    const myHand = await db
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
          eq(schema.roomCards.ownerPlayerId, currentPlayer.id),
        ),
      );

    return data({
      roomId,
      status: room.status,
      myHand,
    });
  }

  // finished: 全員の手札を取得
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
        );

      return {
        playerId: player.id,
        playerName: player.name,
        seatOrder: player.seatOrder,
        hand: handCards,
      };
    }),
  );

  return data({
    roomId,
    status: room.status,
    players: result,
  });
}
