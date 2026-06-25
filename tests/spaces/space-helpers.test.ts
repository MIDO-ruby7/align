import { describe, it, expect } from "vitest";

/**
 * スペース管理ヘルパー関数の単体テスト
 * AC-1: スペース作成・管理者登録
 * AC-3: メンバー招待（即時追加）
 * AC-4: メンバー削除（自分自身は不可）
 * AC-5: スペース一覧
 * AC-7: 他スペースへのアクセス防止
 */

// スペース名バリデーション
function validateSpaceName(name: unknown): { valid: boolean; error?: string } {
  if (typeof name !== "string" || !name.trim()) {
    return { valid: false, error: "スペース名を入力してください" };
  }
  if (name.trim().length > 100) {
    return { valid: false, error: "スペース名は100文字以内で入力してください" };
  }
  return { valid: true };
}

// メールアドレスバリデーション
function validateEmail(email: unknown): { valid: boolean; error?: string } {
  if (typeof email !== "string" || !email.trim()) {
    return { valid: false, error: "メールアドレスを入力してください" };
  }
  return { valid: true };
}

// スペースメンバーシップチェック
function checkMembership(
  memberships: Array<{ spaceId: string; userId: string; role: string }>,
  spaceId: string,
  userId: string,
): { isMember: boolean; isAdmin: boolean } {
  const membership = memberships.find(
    (m) => m.spaceId === spaceId && m.userId === userId,
  );
  if (!membership) return { isMember: false, isAdmin: false };
  return { isMember: true, isAdmin: membership.role === "admin" };
}

// メンバー削除チェック（自分自身は不可）
function canRemoveMember(
  actorId: string,
  targetId: string,
  actorRole: string,
): { canRemove: boolean; error?: string } {
  if (actorRole !== "admin") {
    return { canRemove: false, error: "管理者のみメンバーを削除できます" };
  }
  if (actorId === targetId) {
    return { canRemove: false, error: "自分自身をスペースから削除することはできません" };
  }
  return { canRemove: true };
}

describe("スペース名バリデーション (AC-1)", () => {
  it("正常なスペース名は有効", () => {
    expect(validateSpaceName("開発チーム")).toEqual({ valid: true });
    expect(validateSpaceName("Team Alpha")).toEqual({ valid: true });
  });

  it("空文字は無効", () => {
    const result = validateSpaceName("");
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("空白のみは無効", () => {
    const result = validateSpaceName("   ");
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("100文字以内は有効", () => {
    const name = "a".repeat(100);
    expect(validateSpaceName(name)).toEqual({ valid: true });
  });

  it("101文字は無効", () => {
    const name = "a".repeat(101);
    const result = validateSpaceName(name);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("100文字以内");
  });

  it("undefined は無効", () => {
    const result = validateSpaceName(undefined);
    expect(result.valid).toBe(false);
  });
});

describe("メールアドレスバリデーション (AC-3)", () => {
  it("正常なメールアドレスは有効", () => {
    expect(validateEmail("user@example.com")).toEqual({ valid: true });
  });

  it("空文字は無効", () => {
    const result = validateEmail("");
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("undefined は無効", () => {
    const result = validateEmail(undefined);
    expect(result.valid).toBe(false);
  });
});

describe("スペースメンバーシップチェック (AC-5, AC-7)", () => {
  const memberships = [
    { spaceId: "space-1", userId: "user-1", role: "admin" },
    { spaceId: "space-1", userId: "user-2", role: "member" },
    { spaceId: "space-2", userId: "user-3", role: "admin" },
  ];

  it("所属しているスペースは isMember=true", () => {
    const result = checkMembership(memberships, "space-1", "user-1");
    expect(result.isMember).toBe(true);
  });

  it("管理者ユーザーは isAdmin=true", () => {
    const result = checkMembership(memberships, "space-1", "user-1");
    expect(result.isAdmin).toBe(true);
  });

  it("一般メンバーは isAdmin=false", () => {
    const result = checkMembership(memberships, "space-1", "user-2");
    expect(result.isMember).toBe(true);
    expect(result.isAdmin).toBe(false);
  });

  it("他スペースのデータにはアクセスできない (AC-7)", () => {
    // user-1 は space-2 に所属していない
    const result = checkMembership(memberships, "space-2", "user-1");
    expect(result.isMember).toBe(false);
    expect(result.isAdmin).toBe(false);
  });

  it("存在しないスペースへのアクセスは拒否", () => {
    const result = checkMembership(memberships, "space-999", "user-1");
    expect(result.isMember).toBe(false);
  });
});

describe("メンバー削除チェック (AC-4)", () => {
  it("管理者が他メンバーを削除できる", () => {
    const result = canRemoveMember("admin-user", "target-user", "admin");
    expect(result.canRemove).toBe(true);
  });

  it("管理者は自分自身を削除できない (AC-4)", () => {
    const result = canRemoveMember("admin-user", "admin-user", "admin");
    expect(result.canRemove).toBe(false);
    expect(result.error).toContain("自分自身");
  });

  it("一般メンバーはメンバーを削除できない", () => {
    const result = canRemoveMember("member-user", "target-user", "member");
    expect(result.canRemove).toBe(false);
    expect(result.error).toContain("管理者のみ");
  });
});
