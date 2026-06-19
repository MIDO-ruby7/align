import { integer, sqliteTable, text, primaryKey, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./index";

// スペーステーブル
export const spaces = sqliteTable("spaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerUserId: text("owner_user_id")
    .notNull()
    .references(() => user.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// スペースメンバーテーブル
export const spaceMembers = sqliteTable(
  "space_members",
  {
    spaceId: text("space_id")
      .notNull()
      .references(() => spaces.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    role: text("role", { enum: ["admin", "member"] }).notNull(),
    joinedAt: integer("joined_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.spaceId, t.userId] })],
);

// マスターカードテーブル（スペース共通の雛形）
export const masterCards = sqliteTable("master_cards", {
  id: text("id").primaryKey(),
  text: text("text").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// カードテーブル（スペースごとのコピー）
export const cards = sqliteTable("cards", {
  id: text("id").primaryKey(),
  spaceId: text("space_id")
    .notNull()
    .references(() => spaces.id),
  text: text("text").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// ルームテーブル
export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(),
  spaceId: text("space_id")
    .notNull()
    .references(() => spaces.id),
  inviteCode: text("invite_code").notNull().unique(),
  hostUserId: text("host_user_id")
    .notNull()
    .references(() => user.id),
  status: text("status", { enum: ["waiting", "playing", "finished"] })
    .notNull()
    .default("waiting"),
  deckSize: integer("deck_size").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ルームプレイヤーテーブル
export const roomPlayers = sqliteTable(
  "room_players",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id),
    userId: text("user_id").references(() => user.id),
    name: text("name").notNull(),
    seatOrder: integer("seat_order"),
    joinedAt: integer("joined_at", { mode: "timestamp" }).notNull(),
  },
  (table) => ({
    roomNameUnique: uniqueIndex("room_players_room_id_name_unique").on(table.roomId, table.name),
  }),
);

// ルームカードテーブル
export const roomCards = sqliteTable(
  "room_cards",
  {
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id),
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id),
    location: text("location", { enum: ["deck", "hand", "other"] })
      .notNull()
      .default("deck"),
    ownerPlayerId: text("owner_player_id").references(() => roomPlayers.id),
    position: integer("position").notNull(),
  },
  (t) => [primaryKey({ columns: [t.roomId, t.cardId] })],
);

// ターンテーブル
export const turns = sqliteTable("turns", {
  id: text("id").primaryKey(),
  roomId: text("room_id")
    .notNull()
    .references(() => rooms.id),
  playerId: text("player_id")
    .notNull()
    .references(() => roomPlayers.id),
  turnNumber: integer("turn_number").notNull(),
  action: text("action", { enum: ["draw", "discard"] }).notNull(),
  // NOTE: drawn_card_id / discarded_card_id は cards.id への参照。
  // T6 アプリ層で「そのカードが当該ルームの room_cards に存在すること」を必ず検証すること。
  drawnCardId: text("drawn_card_id").references(() => cards.id),
  discardedCardId: text("discarded_card_id").references(() => cards.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
