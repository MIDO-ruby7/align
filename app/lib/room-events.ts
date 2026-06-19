/**
 * WebSocket ブロードキャストイベント型定義
 * T7: Durable Objects によるリアルタイム同期
 */

export type RoomPlayer = {
  id: string;
  userId: string | null;
  name: string;
  seatOrder: number | null;
};

export type RoomUpdatedEvent = {
  type: "room.updated";
  roomId: string;
  players: RoomPlayer[];
};

export type GameStartedEvent = {
  type: "game.started";
  roomId: string;
  seatOrder: Array<{ playerId: string; seatOrder: number }>;
  deckCount: number;
  handCount: number;
};

export type GameTurnAdvancedEvent = {
  type: "game.turn_advanced";
  roomId: string;
  currentPlayerId: string;
  deckCount: number;
  otherCount: number;
};

export type GameFinishedEvent = {
  type: "game.finished";
  roomId: string;
  hands: Record<string, string[]>; // playerId -> cardId[]
};

export type StateSnapshotEvent = {
  type: "state.snapshot";
  roomId: string;
  roomStatus: "waiting" | "playing" | "finished";
  players: RoomPlayer[];
  currentPlayerId: string | null;
  deckCount: number;
  otherCount: number;
};

export type RoomEvent =
  | RoomUpdatedEvent
  | GameStartedEvent
  | GameTurnAdvancedEvent
  | GameFinishedEvent
  | StateSnapshotEvent;
