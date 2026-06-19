import { describe, it, expect } from "vitest";
import {
  applyRoomEvent,
  createInitialGameState,
  isMyTurn,
  canDraw,
  canDiscard,
  sortPlayersBySeatOrder,
} from "../../app/lib/play-helpers";
import type { RoomEvent } from "../../app/lib/room-events";

describe("applyRoomEvent", () => {
  it("state.snapshot でゲーム状態を初期化する", () => {
    const initial = createInitialGameState();
    const event: RoomEvent = {
      type: "state.snapshot",
      roomId: "room-1",
      roomStatus: "playing",
      players: [
        { id: "p1", userId: "u1", name: "Alice", seatOrder: 0 },
        { id: "p2", userId: "u2", name: "Bob", seatOrder: 1 },
      ],
      currentPlayerId: "p1",
      deckCount: 10,
      otherCount: 2,
      myHand: ["c1", "c2", "c3", "c4", "c5"],
    };
    const next = applyRoomEvent(initial, event);
    expect(next.currentPlayerId).toBe("p1");
    expect(next.deckCount).toBe(10);
    expect(next.otherCount).toBe(2);
    expect(next.myHand).toHaveLength(5);
    expect(next.players).toHaveLength(2);
    expect(next.phase).toBe("draw");
    expect(next.finished).toBe(false);
  });

  it("state.snapshot で手札が 6 枚なら discard フェーズ", () => {
    const initial = createInitialGameState();
    const event: RoomEvent = {
      type: "state.snapshot",
      roomId: "room-1",
      roomStatus: "playing",
      players: [],
      currentPlayerId: "p1",
      deckCount: 5,
      otherCount: 0,
      myHand: ["c1", "c2", "c3", "c4", "c5", "c6"],
    };
    const next = applyRoomEvent(initial, event);
    expect(next.phase).toBe("discard");
  });

  it("state.snapshot で status が finished なら finished フラグが立つ", () => {
    const initial = createInitialGameState();
    const event: RoomEvent = {
      type: "state.snapshot",
      roomId: "room-1",
      roomStatus: "finished",
      players: [],
      currentPlayerId: null,
      deckCount: 0,
      otherCount: 0,
      myHand: ["c1", "c2", "c3", "c4", "c5"],
    };
    const next = applyRoomEvent(initial, event);
    expect(next.finished).toBe(true);
  });

  it("game.card_drawn でデッキ数を更新する", () => {
    const state = { ...createInitialGameState(), deckCount: 10, otherCount: 3 };
    const event: RoomEvent = {
      type: "game.card_drawn",
      roomId: "room-1",
      playerId: "p1",
      deckCount: 9,
      otherCount: 3,
    };
    const next = applyRoomEvent(state, event);
    expect(next.deckCount).toBe(9);
    expect(next.otherCount).toBe(3);
  });

  it("game.turn_advanced でターン担当プレイヤーとデッキ数を更新する", () => {
    const state = { ...createInitialGameState(), currentPlayerId: "p1" };
    const event: RoomEvent = {
      type: "game.turn_advanced",
      roomId: "room-1",
      currentPlayerId: "p2",
      deckCount: 8,
      otherCount: 4,
    };
    const next = applyRoomEvent(state, event);
    expect(next.currentPlayerId).toBe("p2");
    expect(next.deckCount).toBe(8);
    expect(next.otherCount).toBe(4);
  });

  it("game.finished で finished フラグが立つ", () => {
    const state = createInitialGameState();
    const event: RoomEvent = {
      type: "game.finished",
      roomId: "room-1",
      hands: { p1: ["c1", "c2", "c3", "c4", "c5"] },
    };
    const next = applyRoomEvent(state, event);
    expect(next.finished).toBe(true);
  });
});

describe("isMyTurn", () => {
  it("currentPlayerId と myPlayerId が一致する場合 true", () => {
    expect(isMyTurn("p1", "p1")).toBe(true);
  });

  it("currentPlayerId と myPlayerId が異なる場合 false", () => {
    expect(isMyTurn("p1", "p2")).toBe(false);
  });

  it("currentPlayerId が null の場合 false", () => {
    expect(isMyTurn(null, "p1")).toBe(false);
  });

  it("myPlayerId が null の場合 false", () => {
    expect(isMyTurn("p1", null)).toBe(false);
  });

  it("myPlayerId が undefined の場合 false", () => {
    expect(isMyTurn("p1", undefined)).toBe(false);
  });
});

describe("canDraw", () => {
  it("自分のターンで手札 5 枚なら true", () => {
    expect(canDraw("p1", "p1", 5)).toBe(true);
  });

  it("自分のターンで手札 6 枚なら false", () => {
    expect(canDraw("p1", "p1", 6)).toBe(false);
  });

  it("相手のターンなら false", () => {
    expect(canDraw("p2", "p1", 5)).toBe(false);
  });
});

describe("canDiscard", () => {
  it("自分のターンで手札 6 枚なら true", () => {
    expect(canDiscard("p1", "p1", 6)).toBe(true);
  });

  it("自分のターンで手札 5 枚なら false", () => {
    expect(canDiscard("p1", "p1", 5)).toBe(false);
  });

  it("相手のターンなら false", () => {
    expect(canDiscard("p2", "p1", 6)).toBe(false);
  });
});

describe("sortPlayersBySeatOrder", () => {
  it("seatOrder 順にソートする", () => {
    const players = [
      { id: "p3", userId: "u3", name: "Charlie", seatOrder: 2 },
      { id: "p1", userId: "u1", name: "Alice", seatOrder: 0 },
      { id: "p2", userId: "u2", name: "Bob", seatOrder: 1 },
    ];
    const sorted = sortPlayersBySeatOrder(players);
    expect(sorted[0].id).toBe("p1");
    expect(sorted[1].id).toBe("p2");
    expect(sorted[2].id).toBe("p3");
  });

  it("seatOrder が null のプレイヤーは末尾に配置する", () => {
    const players = [
      { id: "p2", userId: "u2", name: "Bob", seatOrder: null },
      { id: "p1", userId: "u1", name: "Alice", seatOrder: 0 },
    ];
    const sorted = sortPlayersBySeatOrder(players);
    expect(sorted[0].id).toBe("p1");
    expect(sorted[1].id).toBe("p2");
  });

  it("元の配列を変更しない", () => {
    const players = [
      { id: "p2", userId: "u2", name: "Bob", seatOrder: 1 },
      { id: "p1", userId: "u1", name: "Alice", seatOrder: 0 },
    ];
    const original = [...players];
    sortPlayersBySeatOrder(players);
    expect(players[0].id).toBe(original[0].id);
  });
});
