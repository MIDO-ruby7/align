/**
 * /rooms/:roomId/play - ゲーム画面
 * AC-1: ゲーム状態（ターン・山札・手札・プレイヤー）を表示
 * AC-2: 自分のターン時のみ draw/discard ボタンを活性化
 * AC-3: WebSocket でリアルタイム更新
 * AC-4: game.finished イベントで結果画面へ遷移
 * AC-5: レスポンシブ対応
 */
import { data, redirect } from "react-router";
import { useNavigate, useFetcher } from "react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { Plus, Loader, Trash2 } from "lucide-react";
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
import { GameCard } from "~/components/GameCard";

export function meta() {
  return [{ title: `ゲーム中 - Align` }];
}

// draw/discard は useFetcher で送信するため再検証不要（WebSocket が状態を管理）
export function shouldRevalidate() {
  return false;
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

  // 直前の手札を記録して新しく引いたカードを特定
  const prevHandRef = useRef<string[]>(initialMyHand.map((c) => c.cardId));
  const [newlyDrawnCardId, setNewlyDrawnCardId] = useState<string | null>(null);

  // 選択中のカード（捨てる候補）
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

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

          // draw イベントで新しいカードを特定
          if (rawData.type === "game.card_drawn") {
            const prevIds = new Set(prevHandRef.current);
            const newIds = next.myHand.filter((id) => !prevIds.has(id));
            if (newIds.length > 0) {
              setNewlyDrawnCardId(newIds[0]);
              setTimeout(() => setNewlyDrawnCardId(null), 400);
            }
            prevHandRef.current = next.myHand;
          }

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
  useEffect(() => {
    if (gameState.myHand.length === 0) return;

    const unknownIds = gameState.myHand.filter(
      (id) => !fetchedCardIdsRef.current.has(id),
    );
    if (unknownIds.length === 0) return;

    unknownIds.forEach((id) => fetchedCardIdsRef.current.add(id));

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
        unknownIds.forEach((id) => fetchedCardIdsRef.current.delete(id));
      });
  }, [roomId, gameState.myHand]);

  const drawFetcher = useFetcher({ key: `draw-${roomId}` });
  const discardFetcher = useFetcher({ key: `discard-${roomId}` });

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

  const handleCardSelect = (cardId: string) => {
    if (!isDiscardMode || !myTurnCanDiscard) return;
    setSelectedCardId((prev) => (prev === cardId ? null : cardId));
  };

  // discardFetcher の送信後は選択を解除
  useEffect(() => {
    if (discardFetcher.state === "idle" && discardFetcher.data) {
      setSelectedCardId(null);
    }
  }, [discardFetcher.state, discardFetcher.data]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 to-indigo-50">
      {/* 接続断バナー */}
      {gameState.disconnected && (
        <div className="reconnecting-banner bg-red-500 text-white text-center py-2 px-4 text-sm font-medium">
          接続が切れました。再接続中...
        </div>
      )}

      <div className="max-w-3xl mx-auto py-4 px-4">
        {/* 上部: ゲーム状態バー */}
        <div className="bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-xl shadow p-4 mb-4">
          <div className="flex flex-wrap gap-4 items-center justify-between">
            <div>
              <span className="text-sm text-indigo-100">現在のターン</span>
              <p className="font-bold text-lg">
                {currentPlayer ? `${currentPlayer.name}さん` : "待機中"}
              </p>
            </div>
            <div className="flex gap-6">
              <div className="text-center">
                <p className="text-xs text-indigo-100">山札</p>
                <p className="text-xl font-bold">
                  {gameState.deckCount}
                  <span className="text-sm font-normal text-indigo-200 ml-1">
                    枚
                  </span>
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-indigo-100">捨て札</p>
                <p className="text-xl font-bold">
                  {gameState.otherCount}
                  <span className="text-sm font-normal text-indigo-200 ml-1">
                    枚
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* discard モード全幅バナー */}
        {isDiscardMode && myTurnCanDiscard && (
          <div className="bg-amber-400 text-amber-900 rounded-xl px-4 py-3 mb-4 flex items-center gap-2 font-semibold text-sm">
            <span>⚠️</span>
            手札が6枚です。捨てるカードを1枚タップしてください
          </div>
        )}

        {/* 相手ターン待機案内 */}
        {!myTurnCanDraw && gameState.currentPlayerId !== myPlayerId && (
          <div className="bg-gray-50 rounded-xl px-4 py-3 mb-4 text-sm text-gray-500 text-center">
            <span className="font-medium text-gray-700">{currentPlayer?.name ?? "?"}さん</span> のターンです。お待ちください
          </div>
        )}

        {/* ドロー操作（draw フェーズ）: 手札の上に配置 */}
        {!isDiscardMode && (
          <div className="bg-white rounded-xl shadow p-4 mb-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">
              カードを引く
            </h2>
            <div className="flex gap-3 flex-wrap">
              <drawFetcher.Form
                method="post"
                action={`/api/rooms/${roomId}/turns/draw`}
              >
                <input type="hidden" name="source" value="deck" />
                <button
                  type="submit"
                  disabled={!myTurnCanDraw || drawFetcher.state !== "idle"}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  {drawFetcher.state !== "idle" ? (
                    <Loader size={16} className="animate-spin" />
                  ) : (
                    <Plus size={16} />
                  )}
                  {drawFetcher.state !== "idle"
                    ? "引いています..."
                    : `山札 (${gameState.deckCount}枚)`}
                </button>
              </drawFetcher.Form>
              <drawFetcher.Form
                method="post"
                action={`/api/rooms/${roomId}/turns/draw`}
              >
                <input type="hidden" name="source" value="other" />
                <button
                  type="submit"
                  disabled={!myTurnCanDraw || drawFetcher.state !== "idle"}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-purple-500 hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  {drawFetcher.state !== "idle" ? (
                    <Loader size={16} className="animate-spin" />
                  ) : (
                    <Plus size={16} />
                  )}
                  {drawFetcher.state !== "idle"
                    ? "引いています..."
                    : `捨て札から引く (${gameState.otherCount}枚)`}
                </button>
              </drawFetcher.Form>
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

        {/* 手札エリア */}
        <div className="bg-white rounded-xl shadow p-4 mb-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-semibold text-gray-700">
              手札 ({gameState.myHand.length} / 6)
            </h2>
          </div>

          {gameState.myHand.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              手札がありません
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {gameState.myHand.map((cardId, idx) => (
                <GameCard
                  key={cardId}
                  cardId={cardId}
                  text={cardTexts[cardId] ?? "..."}
                  isDiscardable={isDiscardMode && myTurnCanDiscard}
                  isSelected={selectedCardId === cardId}
                  onSelect={handleCardSelect}
                  animateIn={newlyDrawnCardId === cardId}
                  index={idx}
                />
              ))}
            </div>
          )}

          {/* 選択中カードの捨てるボタン */}
          {selectedCardId && isDiscardMode && myTurnCanDiscard && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <discardFetcher.Form
                method="post"
                action={`/api/rooms/${roomId}/turns/discard`}
              >
                <input type="hidden" name="cardId" value={selectedCardId} />
                <button
                  type="submit"
                  disabled={discardFetcher.state !== "idle"}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {discardFetcher.state !== "idle" ? (
                    <Loader size={16} className="animate-spin" />
                  ) : (
                    <Trash2 size={16} />
                  )}
                  {discardFetcher.state !== "idle"
                    ? "捨てています..."
                    : `「${cardTexts[selectedCardId] ?? "..."}」を捨てる`}
                </button>
              </discardFetcher.Form>
            </div>
          )}
        </div>

        {/* プレイヤー一覧 */}
        <div className="bg-white rounded-xl shadow p-4">
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
                  className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                    isCurrent ? "bg-indigo-50" : "bg-gray-50"
                  }`}
                >
                  <span className="text-xs text-gray-400 w-5 text-center">
                    {idx + 1}
                  </span>
                  <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs flex-shrink-0">
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <span
                    className={`text-sm flex-1 ${isCurrent ? "font-bold text-indigo-700" : "text-gray-800"}`}
                  >
                    {player.name}
                    {isMe && (
                      <span className="ml-1 text-xs text-gray-400 font-normal">
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
