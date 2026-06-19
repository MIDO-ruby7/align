/**
 * T7: RoomDurableObject
 * 1 ルーム = 1 Durable Object として WebSocket ハブを提供する。
 *
 * エンドポイント:
 *   GET  /ws       - WebSocket アップグレード
 *   POST /broadcast - T6 API から呼ばれるブロードキャスト
 */

import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema/index";
import type { RoomEvent } from "../../app/lib/room-events";

type Session = {
  ws: WebSocket;
  userId: string;
};

/** 24h をミリ秒で表現 */
const CLEANUP_DELAY_MS = 24 * 60 * 60 * 1000;

export class RoomDurableObject implements DurableObject {
  /** 接続中の WebSocket セッション: sessionId -> Session */
  private sessions: Map<string, Session> = new Map();

  constructor(
    private state: DurableObjectState,
    private env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      return this.handleWebSocket(request, url);
    }

    if (url.pathname === "/broadcast") {
      return this.handleBroadcast(request);
    }

    return new Response("Not Found", { status: 404 });
  }

  // ---------------------------------------------------------------------------
  // WebSocket ハンドラ
  // ---------------------------------------------------------------------------

  private async handleWebSocket(request: Request, url: URL): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const userId = url.searchParams.get("userId");
    if (!userId) {
      return new Response("userId is required", { status: 400 });
    }

    // ルームIDは URL パスから取得する（/ws/rooms/:roomId に対して DO の fetch が呼ばれる）
    // DO 内では roomId を searchParams から受け取る
    const roomId = url.searchParams.get("roomId");
    if (!roomId) {
      return new Response("roomId is required", { status: 400 });
    }

    // D1 でルームプレイヤーの所属確認
    const isMember = await this.checkRoomMembership(roomId, userId);
    if (!isMember) {
      // 非メンバーは WebSocket を確立してからすぐ close(4001)
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      server.accept();
      server.close(4001, "Unauthorized: not a room member");
      return new Response(null, { status: 101, webSocket: client });
    }

    // WebSocket ペア作成
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    server.accept();

    const sessionId = crypto.randomUUID();

    // メッセージハンドラ（将来のクライアントメッセージ対応）
    server.addEventListener("message", () => {
      // 現時点ではクライアントからのメッセージは処理しない
    });

    // 切断ハンドラ
    server.addEventListener("close", () => {
      this.sessions.delete(sessionId);
    });

    server.addEventListener("error", () => {
      this.sessions.delete(sessionId);
    });

    // セッション登録
    this.sessions.set(sessionId, { ws: server, userId });

    // 再接続時に現在の状態を送信 (AC-5: state.snapshot)
    const snapshot = await this.buildSnapshot(roomId);
    if (snapshot) {
      try {
        server.send(JSON.stringify(snapshot));
      } catch {
        // 送信失敗は無視
      }
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  // ---------------------------------------------------------------------------
  // ブロードキャストハンドラ
  // ---------------------------------------------------------------------------

  private async handleBroadcast(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    let event: RoomEvent;
    try {
      event = (await request.json()) as RoomEvent;
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    this.broadcast(event);

    // ゲーム終了時にアラームをセット (AC-6: 24h クリーンアップ)
    if (event.type === "game.finished") {
      await this.state.storage.setAlarm(Date.now() + CLEANUP_DELAY_MS);
    }

    return new Response("OK");
  }

  // ---------------------------------------------------------------------------
  // アラーム: ゲーム終了から 24h 後のクリーンアップ (AC-6)
  // ---------------------------------------------------------------------------

  async alarm(): Promise<void> {
    this.sessions.forEach(({ ws }) => {
      try {
        ws.close(1000, "Room cleaned up");
      } catch {
        // 既に閉じているセッションは無視
      }
    });
    this.sessions.clear();
  }

  // ---------------------------------------------------------------------------
  // ユーティリティ
  // ---------------------------------------------------------------------------

  /**
   * 全接続クライアントにイベントをブロードキャスト
   */
  broadcast(event: RoomEvent): void {
    const message = JSON.stringify(event);
    const deadSessions: string[] = [];

    this.sessions.forEach((session, sessionId) => {
      try {
        session.ws.send(message);
      } catch {
        // 送信失敗 = 切断済みセッション
        deadSessions.push(sessionId);
      }
    });

    // 死んだセッションを削除
    deadSessions.forEach((id) => this.sessions.delete(id));
  }

  /**
   * D1 を使ってユーザーがルームメンバーかどうかを確認
   */
  private async checkRoomMembership(roomId: string, userId: string): Promise<boolean> {
    try {
      const db = drizzle(this.env.DB, { schema });
      const player = await db.query.roomPlayers.findFirst({
        where: (rp, { and, eq }) =>
          and(eq(rp.roomId, roomId), eq(rp.userId, userId)),
      });
      return player !== undefined;
    } catch {
      return false;
    }
  }

  /**
   * 現在のルーム状態を取得して state.snapshot イベントを構築
   */
  private async buildSnapshot(
    roomId: string,
  ): Promise<import("../../app/lib/room-events").StateSnapshotEvent | null> {
    try {
      const db = drizzle(this.env.DB, { schema });

      const room = await db.query.rooms.findFirst({
        where: (r, { eq }) => eq(r.id, roomId),
      });
      if (!room) return null;

      const players = await db.query.roomPlayers.findMany({
        where: (rp, { eq }) => eq(rp.roomId, roomId),
        orderBy: (rp, { asc }) => asc(rp.seatOrder),
      });

      // deck/other の枚数（全件取得後にフィルタ）
      const allCards = await db.query.roomCards.findMany({
        where: (rc, { eq }) => eq(rc.roomId, roomId),
      });
      const deckCount = allCards.filter((c) => c.location === "deck").length;
      const otherCount = allCards.filter((c) => c.location === "other").length;

      // 現在のターン担当プレイヤー
      let currentPlayerId: string | null = null;
      if (room.status === "playing") {
        const seatedPlayers = players.filter(
          (p): p is typeof p & { seatOrder: number } => p.seatOrder !== null,
        );
        if (seatedPlayers.length > 0) {
          // turns から completed turns 数を取得
          const turns = await db.query.turns.findMany({
            where: (t, { and, eq }) =>
              and(eq(t.roomId, roomId), eq(t.action, "discard")),
          });
          const completedTurns = turns.length;
          const sorted = [...seatedPlayers].sort((a, b) => a.seatOrder - b.seatOrder);
          const index = completedTurns % sorted.length;
          currentPlayerId = sorted[index].id;
        }
      }

      return {
        type: "state.snapshot",
        roomId,
        roomStatus: room.status,
        players: players.map((p) => ({
          id: p.id,
          userId: p.userId,
          name: p.name,
          seatOrder: p.seatOrder,
        })),
        currentPlayerId,
        deckCount,
        otherCount,
      };
    } catch {
      return null;
    }
  }
}
