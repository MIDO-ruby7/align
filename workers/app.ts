/// <reference types="vite/client" />

import { createRequestHandler } from "react-router";
import { RoomDurableObject } from "./durable-objects/RoomDO";
import { createAuth } from "../app/lib/auth.server";

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

      // V-1・V-2: セッション検証 — クライアント指定の userId は信用せず、
      // better-auth で Cookie を検証して userId をサーバー側で注入する
      const auth = createAuth(env);
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session?.user) {
        return new Response("Unauthorized", { status: 401 });
      }

      const id = env.ROOM.idFromName(roomId);
      const stub = env.ROOM.get(id);

      // DO の /ws エンドポイントに roomId を渡し、検証済み userId を内部ヘッダーで注入
      const wsUrl = new URL(request.url);
      wsUrl.pathname = "/ws";
      wsUrl.searchParams.set("roomId", roomId);
      // クライアントが偽装できないよう内部ヘッダーで userId を渡す
      const internalHeaders = new Headers(request.headers);
      internalHeaders.set("x-verified-user-id", session.user.id);
      internalHeaders.set("x-room-id", roomId);
      const internalRequest = new Request(wsUrl.toString(), {
        method: request.method,
        headers: internalHeaders,
        body: request.body,
      });
      return stub.fetch(internalRequest);
    }

    return requestHandler(request, { cloudflare: { env, ctx } });
  },
} satisfies ExportedHandler<Env>;

export { RoomDurableObject };
