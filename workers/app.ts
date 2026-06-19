/// <reference types="vite/client" />

import { createRequestHandler } from "react-router";
import { RoomDurableObject } from "./durable-objects/RoomDO";

// virtual:react-router/server-build は Vite ビルド時に解決される仮想モジュール
// TypeScript の静的解析では認識されないため @ts-ignore で抑制する
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const requestHandler = createRequestHandler(
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // AC-2: /ws/rooms/:roomId への WebSocket 接続を DO にルーティング
    if (url.pathname.startsWith("/ws/rooms/")) {
      const roomId = url.pathname.split("/")[3];
      if (!roomId) {
        return new Response("roomId is required", { status: 400 });
      }
      const id = env.ROOM.idFromName(roomId);
      const stub = env.ROOM.get(id);
      // DO の /ws エンドポイントに roomId と userId を渡す
      const wsUrl = new URL(request.url);
      wsUrl.pathname = "/ws";
      wsUrl.searchParams.set("roomId", roomId);
      return stub.fetch(new Request(wsUrl.toString(), request));
    }

    return requestHandler(request, { cloudflare: { env, ctx } });
  },
} satisfies ExportedHandler<Env>;

export { RoomDurableObject };
