import { type RouteConfig, index, route, layout } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("api/auth/*", "routes/api.auth.$.tsx"),
  route("register", "routes/register.tsx"),
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),
  layout("routes/spaces.tsx", [
    // spaces の子ルートはここに追加
  ]),
  layout("routes/rooms.tsx", [
    // rooms の子ルートはここに追加
  ]),
] satisfies RouteConfig;
