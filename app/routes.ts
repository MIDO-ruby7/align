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
      route(":spaceId/admin/cards", "routes/spaces.$spaceId.admin.cards.tsx"),
      route(":spaceId/admin/settings", "routes/spaces.$spaceId.admin.settings.tsx"),
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
  route("api/rooms/:roomId/turns/draw", "routes/api.rooms.$roomId.turns.draw.tsx"),
  route("api/rooms/:roomId/turns/discard", "routes/api.rooms.$roomId.turns.discard.tsx"),
  route("api/rooms/:roomId/result", "routes/api.rooms.$roomId.result.tsx"),
] satisfies RouteConfig;
