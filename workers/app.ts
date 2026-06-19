/// <reference types="vite/client" />

import { createRequestHandler } from "react-router";

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
    return requestHandler(request, { cloudflare: { env, ctx } });
  },
} satisfies ExportedHandler<Env>;

export class RoomDurableObject {
  constructor(private state: DurableObjectState, private env: Env) {}
  async fetch(): Promise<Response> {
    return new Response("RoomDurableObject stub", { status: 200 });
  }
}
