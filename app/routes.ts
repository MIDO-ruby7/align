import { type RouteConfig, index, route, layout, prefix } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("api/auth/*", "routes/api.auth.$.tsx"),
  route("register", "routes/register.tsx"),
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),
  ...prefix("spaces", [
    layout("routes/spaces.tsx", [
      index("routes/spaces._index.tsx"),
      route("new", "routes/spaces.new.tsx"),
      route(":spaceId", "routes/spaces.$spaceId._index.tsx"),
      route(":spaceId/invite", "routes/spaces.$spaceId.invite.tsx"),
      route(":spaceId/members", "routes/spaces.$spaceId.members.tsx"),
    ]),
  ]),
  ...prefix("rooms", [
    layout("routes/rooms.tsx", [
      index("routes/rooms._index.tsx"),
      route("new", "routes/rooms.new.tsx"),
      route("join", "routes/rooms.join.tsx"),
      route(":roomId", "routes/rooms.$roomId._index.tsx"),
    ]),
  ]),
] satisfies RouteConfig;
