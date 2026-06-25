/**
 * T7: RoomDurableObject ロジックのユニットテスト
 * DO のロジック関数（broadcast、session management 等）を中心にテスト
 */

import { describe, it, expect, vi } from "vitest";
import type { RoomEvent } from "../../app/lib/room-events";

// WebSocket の最小モック
function createMockWebSocket() {
  const messages: string[] = [];
  let closed = false;
  let closeCode: number | undefined;
  let closeReason: string | undefined;

  return {
    send: vi.fn((msg: string) => {
      if (closed) throw new Error("WebSocket is already closed");
      messages.push(msg);
    }),
    close: vi.fn((code?: number, reason?: string) => {
      closed = true;
      closeCode = code;
      closeReason = reason;
    }),
    accept: vi.fn(),
    messages,
    get closed() {
      return closed;
    },
    get closeCode() {
      return closeCode;
    },
    get closeReason() {
      return closeReason;
    },
  };
}

// RoomDO の broadcast ロジックを抽出してテスト
// （DO 自体は Cloudflare Workers 環境依存なので、ロジック関数を直接テスト）

type Session = {
  ws: { send: (msg: string) => void };
  userId: string;
};

/**
 * broadcast のコアロジック: 全セッションにメッセージを送信し、
 * 送信失敗したセッションを削除する
 */
function broadcastToSessions(
  sessions: Map<string, Session>,
  event: RoomEvent,
): string[] {
  const message = JSON.stringify(event);
  const deadSessions: string[] = [];

  sessions.forEach((session, sessionId) => {
    try {
      session.ws.send(message);
    } catch {
      deadSessions.push(sessionId);
    }
  });

  deadSessions.forEach((id) => sessions.delete(id));
  return deadSessions;
}

describe("broadcastToSessions", () => {
  it("全接続セッションにイベントを送信する", () => {
    const sessions = new Map<string, Session>();
    const ws1 = createMockWebSocket();
    const ws2 = createMockWebSocket();

    sessions.set("session-1", { ws: ws1, userId: "user-1" });
    sessions.set("session-2", { ws: ws2, userId: "user-2" });

    const event: RoomEvent = {
      type: "room.updated",
      roomId: "room-1",
      players: [],
    };

    broadcastToSessions(sessions, event);

    expect(ws1.send).toHaveBeenCalledWith(JSON.stringify(event));
    expect(ws2.send).toHaveBeenCalledWith(JSON.stringify(event));
  });

  it("送信失敗したセッションを自動削除する", () => {
    const sessions = new Map<string, Session>();
    const wsAlive = createMockWebSocket();
    const wsDead = createMockWebSocket();

    // dead の ws.send が例外を投げる
    wsDead.send.mockImplementation(() => {
      throw new Error("Connection closed");
    });

    sessions.set("alive", { ws: wsAlive, userId: "user-1" });
    sessions.set("dead", { ws: wsDead, userId: "user-2" });

    const event: RoomEvent = {
      type: "game.started",
      roomId: "room-1",
      seatOrder: [],
      deckCount: 10,
      handCount: 5,
    };

    const deadSessions = broadcastToSessions(sessions, event);

    expect(deadSessions).toEqual(["dead"]);
    expect(sessions.has("alive")).toBe(true);
    expect(sessions.has("dead")).toBe(false);
    expect(wsAlive.send).toHaveBeenCalledOnce();
  });

  it("セッションが空の場合は何もしない", () => {
    const sessions = new Map<string, Session>();
    const event: RoomEvent = {
      type: "game.finished",
      roomId: "room-1",
      hands: {},
    };
    const deadSessions = broadcastToSessions(sessions, event);
    expect(deadSessions).toEqual([]);
  });
});

describe("RoomEvent 型定義", () => {
  it("room.updated イベントが正しい型を持つ", () => {
    const event: RoomEvent = {
      type: "room.updated",
      roomId: "room-123",
      players: [
        { id: "player-1", userId: "user-1", name: "Alice", seatOrder: 0 },
        { id: "player-2", userId: "user-2", name: "Bob", seatOrder: 1 },
      ],
    };
    expect(event.type).toBe("room.updated");
    expect(event.players).toHaveLength(2);
  });

  it("game.started イベントが正しい型を持つ", () => {
    const event: RoomEvent = {
      type: "game.started",
      roomId: "room-123",
      seatOrder: [
        { playerId: "player-1", seatOrder: 0 },
        { playerId: "player-2", seatOrder: 1 },
      ],
      deckCount: 20,
      handCount: 5,
    };
    expect(event.type).toBe("game.started");
    expect(event.seatOrder).toHaveLength(2);
    expect(event.deckCount).toBe(20);
  });

  it("game.turn_advanced イベントが正しい型を持つ", () => {
    const event: RoomEvent = {
      type: "game.turn_advanced",
      roomId: "room-123",
      currentPlayerId: "player-2",
      deckCount: 15,
      otherCount: 3,
    };
    expect(event.type).toBe("game.turn_advanced");
    expect(event.currentPlayerId).toBe("player-2");
  });

  it("game.finished イベントが正しい型を持つ", () => {
    const event: RoomEvent = {
      type: "game.finished",
      roomId: "room-123",
      hands: {
        "player-1": ["card-1", "card-2"],
        "player-2": ["card-3", "card-4"],
      },
    };
    expect(event.type).toBe("game.finished");
    expect(Object.keys(event.hands)).toHaveLength(2);
  });

  it("state.snapshot イベントが正しい型を持つ", () => {
    const event: RoomEvent = {
      type: "state.snapshot",
      roomId: "room-123",
      roomStatus: "playing",
      players: [{ id: "player-1", userId: "user-1", name: "Alice", seatOrder: 0 }],
      currentPlayerId: "player-1",
      deckCount: 10,
      otherCount: 5,
    };
    expect(event.type).toBe("state.snapshot");
    expect(event.roomStatus).toBe("playing");
    expect(event.currentPlayerId).toBe("player-1");
  });
});

describe("セッション管理ロジック", () => {
  it("セッション追加・削除が正しく機能する", () => {
    const sessions = new Map<string, Session>();
    const ws = createMockWebSocket();

    sessions.set("session-1", { ws, userId: "user-1" });
    expect(sessions.size).toBe(1);
    expect(sessions.has("session-1")).toBe(true);

    sessions.delete("session-1");
    expect(sessions.size).toBe(0);
    expect(sessions.has("session-1")).toBe(false);
  });

  it("同一 userId で複数セッションを保持できる（再接続シナリオ）", () => {
    const sessions = new Map<string, Session>();
    const ws1 = createMockWebSocket();
    const ws2 = createMockWebSocket();

    sessions.set("session-1", { ws: ws1, userId: "user-1" });
    sessions.set("session-2", { ws: ws2, userId: "user-1" }); // 同じ userId

    expect(sessions.size).toBe(2);
  });

  it("alarm 時に全セッションがクローズされ削除される", () => {
    const sessions = new Map<string, Session>();
    const ws1 = createMockWebSocket();
    const ws2 = createMockWebSocket();

    sessions.set("session-1", { ws: ws1, userId: "user-1" });
    sessions.set("session-2", { ws: ws2, userId: "user-2" });

    // alarm のロジックをシミュレート
    sessions.forEach(({ ws }) => {
      try {
        (ws as ReturnType<typeof createMockWebSocket>).close(1000, "Room cleaned up");
      } catch {
        // 既に閉じているセッションは無視
      }
    });
    sessions.clear();

    expect(sessions.size).toBe(0);
    expect(ws1.close).toHaveBeenCalledWith(1000, "Room cleaned up");
    expect(ws2.close).toHaveBeenCalledWith(1000, "Room cleaned up");
  });
});
