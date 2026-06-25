/**
 * ゲーム画面（play.tsx）で使うクライアントサイドのヘルパー関数
 */

import type { RoomPlayer, RoomEvent, GameCardDrawnEvent, GameTurnAdvancedEvent } from "./room-events";

export type GamePhase = "draw" | "discard";

export type GameClientState = {
  currentPlayerId: string | null;
  deckCount: number;
  otherCount: number;
  myHand: string[];
  players: RoomPlayer[];
  phase: GamePhase;
  disconnected: boolean;
  finished: boolean;
};

/** 初期状態 */
export function createInitialGameState(): GameClientState {
  return {
    currentPlayerId: null,
    deckCount: 0,
    otherCount: 0,
    myHand: [],
    players: [],
    phase: "draw",
    disconnected: false,
    finished: false,
  };
}

/**
 * WebSocket イベントを受け取り、ゲーム状態を更新する純粋関数。
 * state は immutable に扱い、新しいオブジェクトを返す。
 */
export function applyRoomEvent(
  state: GameClientState,
  event: RoomEvent,
): GameClientState {
  switch (event.type) {
    case "state.snapshot":
      return {
        ...state,
        currentPlayerId: event.currentPlayerId,
        deckCount: event.deckCount,
        otherCount: event.otherCount,
        myHand: event.myHand,
        players: event.players,
        // 手札が 6 枚以上なら discard フェーズ
        phase: event.myHand.length >= 6 ? "discard" : "draw",
        finished: event.roomStatus === "finished",
      };
    case "game.card_drawn":
      return {
        ...state,
        deckCount: event.deckCount,
        otherCount: event.otherCount,
        // GAP-1: myHand が含まれている場合（引いたユーザー本人）のみ更新する
        myHand: "myHand" in event ? (event as GameCardDrawnEvent).myHand : state.myHand,
      };
    case "game.turn_advanced": {
      const ev = event as GameTurnAdvancedEvent;
      const myHand =
        ev.discardedCardId
          ? state.myHand.filter((id) => id !== ev.discardedCardId)
          : state.myHand;
      return {
        ...state,
        currentPlayerId: ev.currentPlayerId,
        deckCount: ev.deckCount,
        otherCount: ev.otherCount,
        myHand,
        phase: "draw",
      };
    }
    case "game.finished":
      return {
        ...state,
        finished: true,
      };
    default:
      return state;
  }
}

/**
 * 自分のターンかどうか判定する。
 * myPlayerId: ルームプレイヤー ID（userId ではなく roomPlayers.id）
 */
export function isMyTurn(
  currentPlayerId: string | null,
  myPlayerId: string | null | undefined,
): boolean {
  if (!currentPlayerId || !myPlayerId) return false;
  return currentPlayerId === myPlayerId;
}

/**
 * draw ボタンが活性化できるかを判定する。
 * - 自分のターン
 * - draw フェーズ（手札が 6 枚未満）
 */
export function canDraw(
  currentPlayerId: string | null,
  myPlayerId: string | null | undefined,
  handSize: number,
): boolean {
  return isMyTurn(currentPlayerId, myPlayerId) && handSize < 6;
}

/**
 * discard ボタンが活性化できるかを判定する。
 * - 自分のターン
 * - 手札が 6 枚以上（discard フェーズ）
 */
export function canDiscard(
  currentPlayerId: string | null,
  myPlayerId: string | null | undefined,
  handSize: number,
): boolean {
  return isMyTurn(currentPlayerId, myPlayerId) && handSize >= 6;
}

/**
 * seatOrder 順でソートされたプレイヤー一覧を返す。
 * seatOrder が null のプレイヤーは末尾に配置する。
 */
export function sortPlayersBySeatOrder(players: RoomPlayer[]): RoomPlayer[] {
  return [...players].sort((a, b) => {
    if (a.seatOrder === null && b.seatOrder === null) return 0;
    if (a.seatOrder === null) return 1;
    if (b.seatOrder === null) return -1;
    return a.seatOrder - b.seatOrder;
  });
}
