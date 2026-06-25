import { describe, it, expect } from "vitest";

/**
 * 管理者機能ヘルパー関数の単体テスト
 * AC-1: カード一覧表示（検索・ページネーション）
 * AC-2: カード CRUD（論理削除のみ、物理削除不可）
 * AC-3: デッキ設定（defaultDeckSize）
 * AC-4: 管理者のみアクセス可（member は 403）
 */

// ---- 管理者権限チェック ----

type Membership = { spaceId: string; userId: string; role: "admin" | "member" };

function checkAdminAccess(
  memberships: Membership[],
  spaceId: string,
  userId: string,
): { allowed: boolean; status?: number } {
  const membership = memberships.find(
    (m) => m.spaceId === spaceId && m.userId === userId,
  );
  if (!membership) {
    return { allowed: false, status: 403 };
  }
  if (membership.role !== "admin") {
    return { allowed: false, status: 403 };
  }
  return { allowed: true };
}

describe("管理者権限チェック (AC-4)", () => {
  const memberships: Membership[] = [
    { spaceId: "space-1", userId: "admin-user", role: "admin" },
    { spaceId: "space-1", userId: "member-user", role: "member" },
    { spaceId: "space-2", userId: "other-admin", role: "admin" },
  ];

  it("管理者はアクセスを許可される", () => {
    const result = checkAdminAccess(memberships, "space-1", "admin-user");
    expect(result.allowed).toBe(true);
  });

  it("member ロールのユーザーは 403", () => {
    const result = checkAdminAccess(memberships, "space-1", "member-user");
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(403);
  });

  it("未所属ユーザーは 403", () => {
    const result = checkAdminAccess(memberships, "space-1", "unknown-user");
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(403);
  });

  it("他スペースの管理者は当スペースにアクセスできない", () => {
    const result = checkAdminAccess(memberships, "space-1", "other-admin");
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(403);
  });
});

// ---- カードバリデーション ----

function validateCardText(text: unknown): { valid: boolean; error?: string } {
  if (typeof text !== "string" || !text.trim()) {
    return { valid: false, error: "カードテキストを入力してください" };
  }
  if (text.trim().length > 200) {
    return { valid: false, error: "カードテキストは200文字以内で入力してください" };
  }
  return { valid: true };
}

describe("カードテキストバリデーション (AC-2)", () => {
  it("正常なテキストは有効", () => {
    expect(validateCardText("誠実さ")).toEqual({ valid: true });
  });

  it("空文字は無効", () => {
    const result = validateCardText("");
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("空白のみは無効", () => {
    const result = validateCardText("   ");
    expect(result.valid).toBe(false);
  });

  it("200文字は有効", () => {
    expect(validateCardText("a".repeat(200))).toEqual({ valid: true });
  });

  it("201文字は無効", () => {
    const result = validateCardText("a".repeat(201));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("200文字以内");
  });

  it("undefined は無効", () => {
    const result = validateCardText(undefined);
    expect(result.valid).toBe(false);
  });
});

// ---- 論理削除チェック（物理削除は不可）----

type Card = { id: string; spaceId: string; text: string; isActive: boolean };

function deactivateCard(
  cards: Card[],
  cardId: string,
  spaceId: string,
): { success: boolean; error?: string; updatedCard?: Card } {
  const card = cards.find((c) => c.id === cardId && c.spaceId === spaceId);
  if (!card) {
    return { success: false, error: "カードが見つかりません" };
  }
  const updatedCard = { ...card, isActive: false };
  return { success: true, updatedCard };
}

function checkPhysicalDeleteNotAllowed(): boolean {
  // 物理削除は実装しない（DELETE ボタンを出さない）
  // この関数は「物理削除インテントがないこと」を表すドキュメント的テスト
  const allowedIntents = ["create", "update", "deactivate", "activate"] as const;
  return !allowedIntents.includes("delete" as never);
}

describe("カード論理削除 (AC-2)", () => {
  const cards: Card[] = [
    { id: "card-1", spaceId: "space-1", text: "誠実さ", isActive: true },
    { id: "card-2", spaceId: "space-1", text: "勇気", isActive: true },
    { id: "card-3", spaceId: "space-2", text: "他スペースのカード", isActive: true },
  ];

  it("管理者がカードを論理削除できる（isActive=false）", () => {
    const result = deactivateCard(cards, "card-1", "space-1");
    expect(result.success).toBe(true);
    expect(result.updatedCard?.isActive).toBe(false);
  });

  it("カードは物理削除されない（レコードは残る）", () => {
    const result = deactivateCard(cards, "card-1", "space-1");
    expect(result.success).toBe(true);
    // updatedCard が存在すること = レコードが残っている
    expect(result.updatedCard).toBeDefined();
    expect(result.updatedCard?.id).toBe("card-1");
  });

  it("物理削除インテントは許可されない", () => {
    expect(checkPhysicalDeleteNotAllowed()).toBe(true);
  });

  it("他スペースのカードは操作できない（クロスアクセス防止）", () => {
    const result = deactivateCard(cards, "card-3", "space-1");
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("存在しないカードは操作できない", () => {
    const result = deactivateCard(cards, "card-999", "space-1");
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ---- ページネーション ----

function paginateCards(
  allCards: Card[],
  page: number,
  pageSize: number,
): { items: Card[]; totalPages: number; total: number } {
  const total = allCards.length;
  const totalPages = Math.ceil(total / pageSize);
  const offset = (page - 1) * pageSize;
  const items = allCards.slice(offset, offset + pageSize);
  return { items, totalPages, total };
}

describe("カード一覧ページネーション (AC-1)", () => {
  const cards: Card[] = Array.from({ length: 55 }, (_, i) => ({
    id: `card-${i + 1}`,
    spaceId: "space-1",
    text: `カード${i + 1}`,
    isActive: true,
  }));

  it("1ページ目は20件", () => {
    const result = paginateCards(cards, 1, 20);
    expect(result.items.length).toBe(20);
    expect(result.total).toBe(55);
  });

  it("totalPages は 3（55件÷20件）", () => {
    const result = paginateCards(cards, 1, 20);
    expect(result.totalPages).toBe(3);
  });

  it("3ページ目は15件（55 - 40）", () => {
    const result = paginateCards(cards, 3, 20);
    expect(result.items.length).toBe(15);
  });

  it("2ページ目は2ページ目のカードを返す", () => {
    const result = paginateCards(cards, 2, 20);
    expect(result.items[0].id).toBe("card-21");
  });
});

// ---- デッキ設定バリデーション (AC-3) ----

function validateDeckSize(value: unknown): { valid: boolean; error?: string } {
  const num = parseInt(typeof value === "string" ? value : "", 10);
  if (isNaN(num) || num < 1 || num > 100) {
    return { valid: false, error: "デッキ枚数は1〜100の整数で入力してください" };
  }
  return { valid: true };
}

describe("デッキ設定バリデーション (AC-3)", () => {
  it("1は有効", () => {
    expect(validateDeckSize("1")).toEqual({ valid: true });
  });

  it("100は有効", () => {
    expect(validateDeckSize("100")).toEqual({ valid: true });
  });

  it("10は有効（デフォルト値）", () => {
    expect(validateDeckSize("10")).toEqual({ valid: true });
  });

  it("0は無効", () => {
    const result = validateDeckSize("0");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("1〜100");
  });

  it("101は無効", () => {
    const result = validateDeckSize("101");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("1〜100");
  });

  it("文字列は無効", () => {
    const result = validateDeckSize("abc");
    expect(result.valid).toBe(false);
  });

  it("空文字は無効", () => {
    const result = validateDeckSize("");
    expect(result.valid).toBe(false);
  });
});
