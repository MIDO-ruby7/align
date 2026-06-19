/**
 * /rooms/:roomId/play - ゲーム画面
 * AC-1: ゲーム状態（ターン・山札・手札・プレイヤー）を表示
 * AC-2: 自分のターン時のみ draw/discard ボタンを活性化
 * AC-3: WebSocket でリアルタイム更新
 * AC-4: game.finished イベントで結果画面へ遷移
 * AC-5: レスポンシブ対応
 */
import { data, redirect } from "react-router";
import { Form, useNavigate } from "react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import type { Route } from "./+types/rooms.$roomId.play";
import { requireUser } from "~/lib/session.server";
import { drizzle } from "drizzle-orm/d1";
import { and, eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import {
  applyRoomEvent,
  createInitialGameState,
  canDraw,
  canDiscard,
  sortPlayersBySeatOrder,
} from "~/lib/play-helpers";
import type { RoomEvent } from "~/lib/room-events";

export function meta() {
  return [{ title: `ゲーム中 - Align` }];
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

  // playing 状態でなければロビーにリダイレクト
  if (room.status === "waiting") {
    throw redirect(`/rooms/${roomId}`);
  }
  // finished なら結果画面へ
  if (room.status === "finished") {
    throw redirect(`/rooms/${roomId}/result`);
  }

  // スペースメンバーチェック
  const membership = await db.query.spaceMembers.findFirst({
    where: (m, { and, eq }) =>
      and(eq(m.spaceId, room.spaceId), eq(m.userId, user.id)),
  });

  if (!membership) {
    throw new Response("Forbidden", { status: 403 });
  }

  // プレイヤー一覧
  const players = await db.query.roomPlayers.findMany({
    where: (rp, { eq }) => eq(rp.roomId, roomId),
    orderBy: (rp, { asc }) => [asc(rp.seatOrder)],
  });

  const myPlayer = players.find((p) => p.userId === user.id);

  // V-1: ルームの参加者でない場合はロビーにリダイレクト
  if (!myPlayer) {
    throw redirect(`/rooms/${params.roomId}`);
  }

  // 自分の手札をテキスト付きで取得
  const myHandCards = await db
    .select({
      cardId: schema.roomCards.cardId,
      text: schema.cards.text,
    })
    .from(schema.roomCards)
    .innerJoin(schema.cards, eq(schema.roomCards.cardId, schema.cards.id))
    .where(
      and(
        eq(schema.roomCards.roomId, roomId),
        eq(schema.roomCards.location, "hand"),
        eq(schema.roomCards.ownerPlayerId, myPlayer.id),
      ),
    );

  // 山札・other 枚数
  const deckCards = await db.query.roomCards.findMany({
    where: (rc, { and, eq }) =>
      and(eq(rc.roomId, roomId), eq(rc.location, "deck")),
  });
  const otherCards = await db.query.roomCards.findMany({
    where: (rc, { and, eq }) =>
      and(eq(rc.roomId, roomId), eq(rc.location, "other")),
  });

  // 現在のターン担当（完了した discard ターン数から計算）
  const allTurns = await db.query.turns.findMany({
    where: (t, { eq }) => eq(t.roomId, roomId),
    orderBy: (t, { asc }) => [asc(t.turnNumber)],
  });
  const completedTurns = allTurns.filter((t) => t.action === "discard").length;
  const currentPlayerIndex =
    players.length > 0 ? completedTurns % players.length : 0;
  const currentPlayer = players[currentPlayerIndex] ?? null;

  return data({
    user,
    room,
    players,
    myPlayerId: myPlayer.id,
    myHand: myHandCards.map((rc) => ({ cardId: rc.cardId, text: rc.text })),
    deckCount: deckCards.length,
    otherCount: otherCards.length,
    currentPlayerId: currentPlayer?.id ?? null,
  });
}

export default function PlayPage({ loaderData }: Route.ComponentProps) {
  const {
    room,
    players: initialPlayers,
    myPlayerId,
    myHand: initialMyHand,
    deckCount: initialDeckCount,
    otherCount: initialOtherCount,
    currentPlayerId: initialCurrentPlayerId,
  } = loaderData;
  const roomId = room.id;
  const navigate = useNavigate();

  const [gameState, setGameState] = useState<ReturnType<typeof createInitialGameState>>(() => {
    const state = createInitialGameState();
    return {
      ...state,
      players: initialPlayers.map((p) => ({
        id: p.id,
        userId: p.userId ?? null,
        name: p.name,
        seatOrder: p.seatOrder ?? null,
      })),
      myHand: initialMyHand.map((c) => c.cardId),
      deckCount: initialDeckCount,
      otherCount: initialOtherCount,
      currentPlayerId: initialCurrentPlayerId,
    };
  });

  // カードIDからテキストへのマップ（ローダーで取得したテキストを初期値として設定）
  const [cardTexts, setCardTexts] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const c of initialMyHand) {
      map[c.cardId] = c.text;
    }
    return map;
  });

  // fetch 済み or fetch 中の cardId を管理（無限ループ防止）
  const fetchedCardIdsRef = useRef<Set<string>>(
    new Set(initialMyHand.map((c) => c.cardId)),
  );

  const wsRef = useRef<WebSocket | null>(null);

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const rawData = JSON.parse(event.data as string) as RoomEvent;
        setGameState((prev) => {
          const next = applyRoomEvent(prev, rawData);
          return next;
        });

        if (rawData.type === "game.finished") {
          navigate(`/rooms/${roomId}/result`);
        }
      } catch {
        // JSON パース失敗は無視
      }
    },
    [roomId, navigate],
  );

  useEffect(() => {
    let retryCount = 0;
    let ws: WebSocket;
    let retryTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws/rooms/${roomId}`;
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        handleMessage(event);
        setGameState((prev) => ({ ...prev, disconnected: false }));
        retryCount = 0;
      };

      ws.onclose = () => {
        setGameState((prev) => ({ ...prev, disconnected: true }));
        // GAP-2: 指数バックオフで再接続（最大30秒）
        const delay = Math.min(1000 * 2 ** retryCount, 30000);
        retryCount++;
        retryTimer = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      clearTimeout(retryTimer);
      ws?.close();
    };
  }, [roomId, handleMessage]);

  // カードテキストを fetch（手札更新時）
  // fetchedCardIdsRef で fetch 済み/中の ID を管理し、cardTexts を依存配列から除外して無限ループを防ぐ
  useEffect(() => {
    if (gameState.myHand.length === 0) return;

    const unknownIds = gameState.myHand.filter(
      (id) => !fetchedCardIdsRef.current.has(id),
    );
    if (unknownIds.length === 0) return;

    // fetch 中の ID を事前にマークして重複リクエストを防止
    unknownIds.forEach((id) => fetchedCardIdsRef.current.add(id));

    // /api/rooms/:roomId/result から playing 中は自分の手札テキストを取得
    fetch(`/api/rooms/${roomId}/result`, { credentials: "include" })
      .then((res) => res.json())
      .then((responseData: unknown) => {
        const d = responseData as {
          myHand?: Array<{ cardId: string; cardText: string }>;
        };
        if (d.myHand) {
          const map: Record<string, string> = {};
          for (const item of d.myHand) {
            map[item.cardId] = item.cardText;
          }
          setCardTexts((prev) => ({ ...prev, ...map }));
        }
      })
      .catch(() => {
        // エラー時は fetchedCardIds から除去して次回再試行を可能にする
        unknownIds.forEach((id) => fetchedCardIdsRef.current.delete(id));
      });
  }, [roomId, gameState.myHand]); // cardTexts を依存配列から除外（fetchedCardIdsRef.current で代替チェック）

  const myTurnCanDraw = canDraw(
    gameState.currentPlayerId,
    myPlayerId,
    gameState.myHand.length,
  );
  const myTurnCanDiscard = canDiscard(
    gameState.currentPlayerId,
    myPlayerId,
    gameState.myHand.length,
  );
  const sortedPlayers = sortPlayersBySeatOrder(gameState.players);
  const currentPlayer = gameState.players.find(
    (p) => p.id === gameState.currentPlayerId,
  );

  const isDiscardMode = gameState.myHand.length >= 6;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 接続断バナー */}
      {gameState.disconnected && (
        <div className="reconnecting-banner bg-red-500 text-white text-center py-2 px-4 text-sm font-medium">
          接続が切れました。再接続中...
        </div>
      )}

      <div className="max-w-3xl mx-auto py-4 px-4">
        {/* 上部: ゲーム状態 */}
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <div className="flex flex-wrap gap-4 items-center justify-between">
            <div>
              <span className="text-sm text-gray-500">現在のターン</span>
              <p className="font-bold text-lg text-indigo-700">
                {currentPlayer ? `${currentPlayer.name}さん` : "待機中"}
              </p>
            </div>
            <div className="flex gap-6">
              <div className="text-center">
                <p className="text-xs text-gray-500">山札</p>
                <p className="text-xl font-bold text-gray-800">
                  {gameState.deckCount}
                  <span className="text-sm font-normal text-gray-500 ml-1">
                    枚
                  </span>
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500">Other</p>
                <p className="text-xl font-bold text-gray-800">
                  {gameState.otherCount}
                  <span className="text-sm font-normal text-gray-500 ml-1">
                    枚
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 中央: ドロー操作（draw フェーズ） */}
        {!isDiscardMode && (
          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">
              カードを引く
            </h2>
            <div className="flex gap-3 flex-wrap">
              <Form
                method="post"
                action={`/api/rooms/${roomId}/turns/draw`}
              >
                <input type="hidden" name="source" value="deck" />
                <button
                  type="submit"
                  disabled={!myTurnCanDraw}
                  className="px-4 py-2 rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  山札から引く
                </button>
              </Form>
              <Form
                method="post"
                action={`/api/rooms/${roomId}/turns/draw`}
              >
                <input type="hidden" name="source" value="other" />
                <button
                  type="submit"
                  disabled={!myTurnCanDraw}
                  className="px-4 py-2 rounded-md text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Other から引く
                </button>
              </Form>
            </div>
            {!myTurnCanDraw && (
              <p className="text-xs text-gray-400 mt-2">
                {gameState.currentPlayerId === myPlayerId
                  ? "手札が6枚になったら捨てるカードを選んでください"
                  : "相手のターンです"}
              </p>
            )}
          </div>
        )}

        {/* 中央: 手札 */}
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-semibold text-gray-700">
              手札 ({gameState.myHand.length} / 6)
            </h2>
            {isDiscardMode && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium">
                捨てるカードを選んでください
              </span>
            )}
          </div>

          {gameState.myHand.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">
              手札がありません
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {gameState.myHand.map((cardId) => (
                <div
                  key={cardId}
                  className={`relative rounded-lg border-2 p-3 transition-colors ${
                    isDiscardMode && myTurnCanDiscard
                      ? "border-amber-300 bg-amber-50 hover:border-amber-500 hover:bg-amber-100"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  <p className="text-sm text-gray-800 font-medium min-h-[3rem] flex items-center justify-center text-center">
                    {cardTexts[cardId] ?? cardId}
                  </p>
                  {isDiscardMode && myTurnCanDiscard && (
                    <Form
                      method="post"
                      action={`/api/rooms/${roomId}/turns/discard`}
                      className="mt-2"
                    >
                      <input type="hidden" name="cardId" value={cardId} />
                      <button
                        type="submit"
                        className="w-full py-1 px-2 text-xs rounded bg-red-500 text-white hover:bg-red-600 transition-colors"
                      >
                        捨てる
                      </button>
                    </Form>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 下部: プレイヤー一覧 */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            プレイヤー一覧
          </h2>
          <div className="space-y-2">
            {sortedPlayers.map((player, idx) => {
              const isCurrent = player.id === gameState.currentPlayerId;
              const isMe = player.id === myPlayerId;
              return (
                <div
                  key={player.id}
                  className={`flex items-center gap-3 p-2 rounded-lg ${
                    isCurrent
                      ? "bg-indigo-50 border border-indigo-200"
                      : "bg-gray-50"
                  }`}
                >
                  <span className="text-xs text-gray-400 w-5 text-center">
                    {idx + 1}
                  </span>
                  <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs flex-shrink-0">
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm text-gray-800 flex-1">
                    {player.name}
                    {isMe && (
                      <span className="ml-1 text-xs text-gray-400">
                        （あなた）
                      </span>
                    )}
                  </span>
                  {isCurrent && (
                    <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-full">
                      ターン中
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
