/**
 * POST /api/rooms/:roomId/turns/discard
 * AC-3: ターン担当プレイヤーが自分の hand から 1 枚を other に移動
 *   - body: { cardId: string }
 * AC-4: discard 後に deck・other ともに空なら status='finished' に遷移
 * AC-5: 不正操作（順番外 / 他人の hand / 不正 cardId）は 403/409 で拒否
 */
import { data } from "react-router";
import type { ActionFunctionArgs, AppLoadContext } from "react-router";
import { requireUser } from "~/lib/session.server";
import { drizzle } from "drizzle-orm/d1";
import { and, count, eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { getCurrentTurnPlayer, checkGameFinished } from "~/lib/game-logic";

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

  // プレイヤー取得
  const players = await db.query.roomPlayers.findMany({
    where: (rp, { eq }) => eq(rp.roomId, roomId),
    orderBy: (rp, { asc }) => asc(rp.seatOrder),
  });
  const currentPlayer = players.find((p) => p.userId === user.id);
  if (!currentPlayer) {
    return data({ error: "このルームに参加していません" }, { status: 403 });
  }

  // ターン状態確認
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

  // draw されていない場合は discard 不可
  if (drawCount <= completedTurns) {
    return data(
      { error: "先にカードを引いてください（draw が必要です）" },
      { status: 409 },
    );
  }

  // seatOrder が null のプレイヤーをフィルタ
  const seatedPlayers = players.filter(
    (p): p is typeof p & { seatOrder: number } => p.seatOrder !== null,
  );

  if (seatedPlayers.length === 0) {
    return data({ error: "seat_order が設定されていません" }, { status: 409 });
  }

  // ターン担当確認
  const turnPlayer = getCurrentTurnPlayer(seatedPlayers, completedTurns);
  if (turnPlayer.id !== currentPlayer.id) {
    return data({ error: "あなたのターンではありません" }, { status: 403 });
  }

  // body から cardId を取得
  let cardId: string | undefined;
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { cardId?: string };
      cardId = body.cardId;
    } else {
      const fd = await request.formData();
      cardId = fd.get("cardId")?.toString();
    }
  } catch {
    // パース失敗
  }

  if (!cardId) {
    return data({ error: "cardId が必要です" }, { status: 400 });
  }

  // カードが自分の hand にあることを確認
  const handCard = await db.query.roomCards.findFirst({
    where: (rc, { and, eq }) =>
      and(
        eq(rc.roomId, roomId),
        eq(rc.cardId, cardId!),
        eq(rc.location, "hand"),
        eq(rc.ownerPlayerId, currentPlayer.id),
      ),
  });

  if (!handCard) {
    // 存在するが他人の hand か location='other/deck' の場合も 403
    const anyCard = await db.query.roomCards.findFirst({
      where: (rc, { and, eq }) =>
        and(eq(rc.roomId, roomId), eq(rc.cardId, cardId!)),
    });
    if (!anyCard) {
      return data(
        { error: "指定されたカードはこのルームに存在しません" },
        { status: 409 },
      );
    }
    return data(
      { error: "このカードはあなたの手札にありません" },
      { status: 403 },
    );
  }

  // hand → other に移動
  await db
    .update(schema.roomCards)
    .set({ location: "other", ownerPlayerId: null })
    .where(
      and(
        eq(schema.roomCards.roomId, roomId),
        eq(schema.roomCards.cardId, cardId),
      ),
    );

  // turns に discard を記録
  const turnId = crypto.randomUUID();
  await db.insert(schema.turns).values({
    id: turnId,
    roomId,
    playerId: currentPlayer.id,
    turnNumber: completedTurns,
    action: "discard",
    drawnCardId: null,
    discardedCardId: cardId,
    createdAt: new Date(),
  });

  // 終了判定: deck と other が空かどうか確認
  const [deckCountRow] = await db
    .select({ count: count() })
    .from(schema.roomCards)
    .where(
      and(
        eq(schema.roomCards.roomId, roomId),
        eq(schema.roomCards.location, "deck"),
      ),
    );
  const [otherCountRow] = await db
    .select({ count: count() })
    .from(schema.roomCards)
    .where(
      and(
        eq(schema.roomCards.roomId, roomId),
        eq(schema.roomCards.location, "other"),
      ),
    );

  const deckCount = deckCountRow?.count ?? 0;
  const otherCount = otherCountRow?.count ?? 0;

  const finished = checkGameFinished({ deckCount, otherCount });
  if (finished) {
    await db
      .update(schema.rooms)
      .set({ status: "finished" })
      .where(eq(schema.rooms.id, roomId));
  }

  return data({
    success: true,
    discardedCardId: cardId,
    gameFinished: finished,
  });
}
