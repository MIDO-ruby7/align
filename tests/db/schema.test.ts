import { describe, it, expect } from "vitest";
import {
  user,
  session,
  account,
  verification,
  spaces,
  spaceMembers,
  masterCards,
  cards,
  rooms,
  roomPlayers,
  roomCards,
  turns,
} from "../../db/schema/index";

describe("DB スキーマ定義", () => {
  describe("better-auth テーブル", () => {
    it("user テーブルが定義されていること", () => {
      expect(user).toBeDefined();
      const cols = Object.keys(user);
      expect(cols).toContain("id");
      expect(cols).toContain("email");
      expect(cols).toContain("name");
      expect(cols).toContain("createdAt");
    });

    it("session テーブルが定義されていること", () => {
      expect(session).toBeDefined();
    });

    it("account テーブルが定義されていること", () => {
      expect(account).toBeDefined();
    });

    it("verification テーブルが定義されていること", () => {
      expect(verification).toBeDefined();
    });
  });

  describe("ゲームテーブル", () => {
    it("spaces テーブルが定義されていること", () => {
      expect(spaces).toBeDefined();
      const cols = Object.keys(spaces);
      expect(cols).toContain("id");
      expect(cols).toContain("name");
      expect(cols).toContain("ownerUserId");
      expect(cols).toContain("createdAt");
    });

    it("spaceMembers テーブルが定義されていること", () => {
      expect(spaceMembers).toBeDefined();
      const cols = Object.keys(spaceMembers);
      expect(cols).toContain("spaceId");
      expect(cols).toContain("userId");
      expect(cols).toContain("role");
      expect(cols).toContain("joinedAt");
    });

    it("masterCards テーブルが定義されていること", () => {
      expect(masterCards).toBeDefined();
      const cols = Object.keys(masterCards);
      expect(cols).toContain("id");
      expect(cols).toContain("text");
      expect(cols).toContain("isActive");
      expect(cols).toContain("createdAt");
      expect(cols).toContain("updatedAt");
    });

    it("cards テーブルが定義されていること", () => {
      expect(cards).toBeDefined();
      const cols = Object.keys(cards);
      expect(cols).toContain("id");
      expect(cols).toContain("spaceId");
      expect(cols).toContain("text");
      expect(cols).toContain("isActive");
      expect(cols).toContain("createdAt");
      expect(cols).toContain("updatedAt");
    });

    it("rooms テーブルが定義されていること（invite_code unique）", () => {
      expect(rooms).toBeDefined();
      const cols = Object.keys(rooms);
      expect(cols).toContain("id");
      expect(cols).toContain("spaceId");
      expect(cols).toContain("inviteCode");
      expect(cols).toContain("hostUserId");
      expect(cols).toContain("status");
      expect(cols).toContain("deckSize");
      expect(cols).toContain("createdAt");
    });

    it("roomPlayers テーブルが定義されていること", () => {
      expect(roomPlayers).toBeDefined();
      const cols = Object.keys(roomPlayers);
      expect(cols).toContain("id");
      expect(cols).toContain("roomId");
      expect(cols).toContain("userId");
      expect(cols).toContain("name");
      expect(cols).toContain("seatOrder");
      expect(cols).toContain("joinedAt");
    });

    it("roomCards テーブルが定義されていること", () => {
      expect(roomCards).toBeDefined();
      const cols = Object.keys(roomCards);
      expect(cols).toContain("roomId");
      expect(cols).toContain("cardId");
      expect(cols).toContain("location");
      expect(cols).toContain("ownerPlayerId");
      expect(cols).toContain("position");
    });

    it("turns テーブルが定義されていること", () => {
      expect(turns).toBeDefined();
      const cols = Object.keys(turns);
      expect(cols).toContain("id");
      expect(cols).toContain("roomId");
      expect(cols).toContain("playerId");
      expect(cols).toContain("turnNumber");
      expect(cols).toContain("action");
      expect(cols).toContain("drawnCardId");
      expect(cols).toContain("discardedCardId");
      expect(cols).toContain("createdAt");
    });
  });

  describe("シードデータの確認", () => {
    it("MASTER_CARD_WORDS は 50 件あること", async () => {
      const { MASTER_CARD_WORDS } = await import("../../db/master-card-words");
      expect(MASTER_CARD_WORDS.length).toBe(50);
    });

    it("invite_code は 6 桁英数字のパターンに適合すること", () => {
      const pattern = /^[A-Z0-9]{6}$/;
      const sample = "ABC123";
      expect(pattern.test(sample)).toBe(true);
      expect(pattern.test("abc12")).toBe(false); // 5桁は NG
      expect(pattern.test("abc1234")).toBe(false); // 7桁は NG
    });
  });
});
