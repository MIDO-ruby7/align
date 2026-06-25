/// <reference types="../env.d.ts" />

import { createRequestHandler } from "react-router";
import { RoomDurableObject } from "./durable-objects/RoomDO";
import { createAuth } from "../app/lib/auth.server";

// 本番デプロイ用エントリ: virtual module の代わりに Vite ビルド済みの
// dist/server/index.js を直接インポートする
import * as serverBuild from "../dist/server/index.js";

const requestHandler = createRequestHandler(serverBuild, "production");

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/ws/rooms/")) {
      const roomId = url.pathname.split("/")[3];
      if (!roomId) {
        return new Response("roomId is required", { status: 400 });
      }

      const auth = createAuth(env);
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session?.user) {
        return new Response("Unauthorized", { status: 401 });
      }

      const id = env.ROOM.idFromName(roomId);
      const stub = env.ROOM.get(id);

      const wsUrl = new URL(request.url);
      wsUrl.pathname = "/ws";
      wsUrl.searchParams.set("roomId", roomId);
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
