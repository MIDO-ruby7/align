/**
 * POST /api/rooms/:roomId/turns/draw
 * AC-2: 現在のターン担当プレイヤーのみが 1 枚引ける
 *   - source: 'deck' | 'other'
 */
import { data } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import type { AppLoadContext } from "react-router";
import { requireUser } from "~/lib/session.server";
import { drizzle } from "drizzle-orm/d1";
import { and, count, eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { getCurrentTurnPlayer } from "~/lib/game-logic";

type CloudflareActionArgs = ActionFunctionArgs & {
  params: { roomId: string };
  context: AppLoadContext;
};

export async function action({ request, context, params }: CloudflareActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method Not Allowed" }, { status: 405 });
  }

  const user = await requireUser(request, context);
  const { roomId } = params;
  const db = drizzle((context.cloudflare as { env: { DB: D1Database } }).env.DB, { schema });

  // ルーム取得
  const room = await db.query.rooms.findFirst({
    where: (r, { eq }) => eq(r.id, roomId),
  });
  if (!room) return data({ error: "ルームが見つかりません" }, { status: 404 });
  if (room.status !== "playing") {
    return data({ error: "ゲームが開始されていません" }, { status: 409 });
  }

  // 現在のプレイヤー取得（userId で照合）
  const players = await db.query.roomPlayers.findMany({
    where: (rp, { eq }) => eq(rp.roomId, roomId),
    orderBy: (rp, { asc }) => asc(rp.seatOrder),
  });
  const currentPlayer = players.find((p) => p.userId === user.id);
  if (!currentPlayer) {
    return data({ error: "このルームに参加していません" }, { status: 403 });
  }

  // 最後のターン取得 → 現在のターン番号と担当を算出
  // turns の中で action='discard' の数 = 完了したターン数
  const [discardCountRow] = await db
    .select({ count: count() })
    .from(schema.turns)
    .where(
      and(
        eq(schema.turns.roomId, roomId),
        eq(schema.turns.action, "discard"),
      ),
    );
  const completedTurns = discardCountRow?.count ?? 0;

  // draw の数も確認 (completedTurns === drawCount なら draw 待ち状態)
  const [drawCountRow] = await db
    .select({ count: count() })
    .from(schema.turns)
    .where(
      and(
        eq(schema.turns.roomId, roomId),
        eq(schema.turns.action, "draw"),
      ),
    );
  const drawCount = drawCountRow?.count ?? 0;

  // draw 済みで discard 待ちの場合は draw 不可
  if (drawCount > completedTurns) {
    return data(
      { error: "先にカードを捨ててください（discard が必要です）" },
      { status: 409 },
    );
  }

  // seatOrder が null のプレイヤーはゲーム開始前なのでフィルタ
  const seatedPlayers = players.filter(
    (p): p is typeof p & { seatOrder: number } => p.seatOrder !== null,
  );

  if (seatedPlayers.length === 0) {
    return data({ error: "seat_order が設定されていません" }, { status: 409 });
  }

  // ターン担当プレイヤーを確認
  const turnPlayer = getCurrentTurnPlayer(seatedPlayers, completedTurns);
  if (turnPlayer.id !== currentPlayer.id) {
    return data({ error: "あなたのターンではありません" }, { status: 403 });
  }

  // source パース
  let body: { source?: string } = {};
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      body = (await request.json()) as { source?: string };
    } else {
      const fd = await request.formData();
      body = { source: fd.get("source")?.toString() };
    }
  } catch {
    // body なしでも source='deck' をデフォルトとする
  }
  const source = body.source === "other" ? "other" : "deck";

  // 指定 location からカードを 1 枚取得
  const card = await db.query.roomCards.findFirst({
    where: (rc, { and, eq }) =>
      and(eq(rc.roomId, roomId), eq(rc.location, source)),
  });

  if (!card) {
    // deck が空なら other から引くことを提案
    if (source === "deck") {
      const otherCard = await db.query.roomCards.findFirst({
        where: (rc, { and, eq }) =>
          and(eq(rc.roomId, roomId), eq(rc.location, "other")),
      });
      if (!otherCard) {
        return data(
          { error: "引けるカードがありません（deck・other ともに空）" },
          { status: 409 },
        );
      }
      return data(
        { error: "山札が空です。source=other を指定してください" },
        { status: 409 },
      );
    }
    return data({ error: "引けるカードがありません" }, { status: 409 });
  }

  // hand に移動
  await db
    .update(schema.roomCards)
    .set({ location: "hand", ownerPlayerId: currentPlayer.id })
    .where(
      and(
        eq(schema.roomCards.roomId, roomId),
        eq(schema.roomCards.cardId, card.cardId),
      ),
    );

  // turns に draw を記録
  const turnId = crypto.randomUUID();
  await db.insert(schema.turns).values({
    id: turnId,
    roomId,
    playerId: currentPlayer.id,
    turnNumber: completedTurns,
    action: "draw",
    drawnCardId: card.cardId,
    discardedCardId: null,
    createdAt: new Date(),
  });

  return data({ success: true, drawnCardId: card.cardId });
}
