/**
 * T7: Durable Objects ブロードキャストユーティリティ
 * T6 の各 API（start / draw / discard）完了後に DO の /broadcast エンドポイントを呼ぶ
 */
import type { RoomEvent } from "./room-events";

export async function broadcastRoomEvent(
  env: Env,
  roomId: string,
  event: RoomEvent,
): Promise<void> {
  const id = env.ROOM.idFromName(roomId);
  const stub = env.ROOM.get(id);
  await stub.fetch(
    new Request("http://do/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    }),
  );
}
