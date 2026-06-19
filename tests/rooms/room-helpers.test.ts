import { describe, it, expect } from "vitest";

/**
 * ルーム管理ヘルパー関数の単体テスト
 * AC-1: ルーム作成・招待コード生成
 * AC-2: 招待コードによる参加・スペースメンバーチェック
 * AC-3: 同一ルーム内の名前重複チェック
 * AC-4: 最大人数チェック
 * AC-6: ホスト権限チェック
 */

// 招待コード生成
function generateInviteCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // I, O, L を除外
  return Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)],
  ).join("");
}

// 招待コードバリデーション
function validateInviteCode(code: unknown): { valid: boolean; error?: string } {
  if (typeof code !== "string" || !code.trim()) {
    return { valid: false, error: "招待コードを入力してください" };
  }
  const upper = code.trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(upper)) {
    return { valid: false, error: "招待コードは6文字の英数字です" };
  }
  return { valid: true };
}

// プレイヤー名バリデーション
function validatePlayerName(name: unknown): { valid: boolean; error?: string } {
  if (typeof name !== "string" || !name.trim()) {
    return { valid: false, error: "プレイヤー名を入力してください" };
  }
  if (name.trim().length > 50) {
    return { valid: false, error: "プレイヤー名は50文字以内で入力してください" };
  }
  return { valid: true };
}

// 名前重複チェック (AC-3)
function checkNameDuplicate(
  players: Array<{ name: string }>,
  newName: string,
): { isDuplicate: boolean } {
  const exists = players.some(
    (p) => p.name.toLowerCase() === newName.toLowerCase(),
  );
  return { isDuplicate: exists };
}

// 最大人数チェック (AC-4)
const MAX_PLAYERS = 8;
function checkMaxPlayers(currentCount: number): { canJoin: boolean; error?: string } {
  if (currentCount >= MAX_PLAYERS) {
    return { canJoin: false, error: `ルームは最大${MAX_PLAYERS}人までです` };
  }
  return { canJoin: true };
}

// ホスト権限チェック (AC-6)
function checkHostPermission(
  hostUserId: string,
  currentUserId: string,
): { isHost: boolean } {
  return { isHost: hostUserId === currentUserId };
}

// ゲーム開始条件チェック (AC-6)
function canStartGame(
  hostUserId: string,
  currentUserId: string,
  status: string,
  playerCount: number,
): { canStart: boolean; error?: string } {
  if (hostUserId !== currentUserId) {
    return { canStart: false, error: "ホストのみゲームを開始できます" };
  }
  if (status !== "waiting") {
    return { canStart: false, error: "ゲームはすでに開始されています" };
  }
  if (playerCount < 1) {
    return { canStart: false, error: "プレイヤーが1人以上必要です" };
  }
  return { canStart: true };
}

// スペースメンバーシップチェック (AC-2)
function checkSpaceMembership(
  memberships: Array<{ spaceId: string; userId: string }>,
  spaceId: string,
  userId: string,
): { isMember: boolean } {
  const exists = memberships.some(
    (m) => m.spaceId === spaceId && m.userId === userId,
  );
  return { isMember: exists };
}

describe("招待コード生成 (AC-1)", () => {
  it("生成されたコードは6文字", () => {
    const code = generateInviteCode();
    expect(code).toHaveLength(6);
  });

  it("生成されたコードは有効な文字のみ含む", () => {
    const chars = new Set("ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
    for (let i = 0; i < 20; i++) {
      const code = generateInviteCode();
      for (const ch of code) {
        expect(chars.has(ch)).toBe(true);
      }
    }
  });

  it("複数回生成すると異なるコードが得られる（ランダム性確認）", () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateInviteCode()));
    // 100回生成して全て同じになる確率は実質ゼロ
    expect(codes.size).toBeGreaterThan(1);
  });

  it("紛らわしい文字 (I, O, L, 0, 1) は含まれない", () => {
    const ambiguous = new Set("IOL01"); // generateInviteCode の chars から除外済み
    for (let i = 0; i < 100; i++) {
      const code = generateInviteCode();
      for (const ch of code) {
        expect(ambiguous.has(ch)).toBe(false);
      }
    }
  });
});

describe("招待コードバリデーション", () => {
  it("正しい形式の招待コードは有効", () => {
    expect(validateInviteCode("ABC234")).toEqual({ valid: true });
    expect(validateInviteCode("XYZPQR")).toEqual({ valid: true });
  });

  it("小文字入力も許容（内部で大文字変換）", () => {
    // バリデーション関数内でtoUpperCase()しているため通る
    expect(validateInviteCode("abc234")).toEqual({ valid: true });
  });

  it("空文字は無効", () => {
    const result = validateInviteCode("");
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("5文字は無効", () => {
    const result = validateInviteCode("ABCDE");
    expect(result.valid).toBe(false);
  });

  it("7文字は無効", () => {
    const result = validateInviteCode("ABCDEFG");
    expect(result.valid).toBe(false);
  });

  it("紛らわしい文字を含む場合は無効", () => {
    const result = validateInviteCode("ABC0DE");
    expect(result.valid).toBe(false);
  });

  it("undefined は無効", () => {
    const result = validateInviteCode(undefined);
    expect(result.valid).toBe(false);
  });
});

describe("プレイヤー名バリデーション", () => {
  it("正常なプレイヤー名は有効", () => {
    expect(validatePlayerName("田中太郎")).toEqual({ valid: true });
    expect(validatePlayerName("Alice")).toEqual({ valid: true });
  });

  it("空文字は無効", () => {
    const result = validatePlayerName("");
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("50文字以内は有効", () => {
    expect(validatePlayerName("a".repeat(50))).toEqual({ valid: true });
  });

  it("51文字は無効", () => {
    const result = validatePlayerName("a".repeat(51));
    expect(result.valid).toBe(false);
    expect(result.error).toContain("50文字以内");
  });
});

describe("名前重複チェック (AC-3)", () => {
  const players = [
    { name: "Alice" },
    { name: "Bob" },
    { name: "Carol" },
  ];

  it("重複する名前は isDuplicate=true", () => {
    expect(checkNameDuplicate(players, "Alice")).toEqual({ isDuplicate: true });
  });

  it("大文字小文字を区別しない", () => {
    expect(checkNameDuplicate(players, "alice")).toEqual({ isDuplicate: true });
    expect(checkNameDuplicate(players, "ALICE")).toEqual({ isDuplicate: true });
  });

  it("新しい名前は isDuplicate=false", () => {
    expect(checkNameDuplicate(players, "Dave")).toEqual({ isDuplicate: false });
  });

  it("プレイヤーがいない場合は isDuplicate=false", () => {
    expect(checkNameDuplicate([], "Alice")).toEqual({ isDuplicate: false });
  });
});

describe("最大人数チェック (AC-4)", () => {
  it("7人以下なら参加可能", () => {
    expect(checkMaxPlayers(7)).toEqual({ canJoin: true });
    expect(checkMaxPlayers(0)).toEqual({ canJoin: true });
  });

  it("8人（上限）なら参加不可", () => {
    const result = checkMaxPlayers(8);
    expect(result.canJoin).toBe(false);
    expect(result.error).toContain("8人");
  });

  it("9人でも参加不可", () => {
    const result = checkMaxPlayers(9);
    expect(result.canJoin).toBe(false);
  });
});

describe("ホスト権限チェック (AC-6)", () => {
  it("ホストユーザーは isHost=true", () => {
    expect(checkHostPermission("user-1", "user-1")).toEqual({ isHost: true });
  });

  it("ホスト以外は isHost=false", () => {
    expect(checkHostPermission("user-1", "user-2")).toEqual({ isHost: false });
  });
});

describe("ゲーム開始条件チェック (AC-6)", () => {
  it("ホストかつ waiting 状態かつプレイヤーがいれば開始可能", () => {
    expect(canStartGame("user-1", "user-1", "waiting", 2)).toEqual({ canStart: true });
  });

  it("ホスト以外は開始不可", () => {
    const result = canStartGame("user-1", "user-2", "waiting", 2);
    expect(result.canStart).toBe(false);
    expect(result.error).toContain("ホスト");
  });

  it("playing 状態では開始不可", () => {
    const result = canStartGame("user-1", "user-1", "playing", 2);
    expect(result.canStart).toBe(false);
    expect(result.error).toContain("開始");
  });

  it("プレイヤー0人では開始不可", () => {
    const result = canStartGame("user-1", "user-1", "waiting", 0);
    expect(result.canStart).toBe(false);
    expect(result.error).toContain("1人以上");
  });
});

describe("スペースメンバーシップチェック (AC-2)", () => {
  const memberships = [
    { spaceId: "space-1", userId: "user-1" },
    { spaceId: "space-1", userId: "user-2" },
    { spaceId: "space-2", userId: "user-3" },
  ];

  it("スペースメンバーは isMember=true", () => {
    expect(checkSpaceMembership(memberships, "space-1", "user-1")).toEqual({
      isMember: true,
    });
  });

  it("非メンバーは isMember=false", () => {
    expect(checkSpaceMembership(memberships, "space-1", "user-3")).toEqual({
      isMember: false,
    });
  });

  it("別スペースのメンバーは対象スペースで isMember=false", () => {
    expect(checkSpaceMembership(memberships, "space-2", "user-1")).toEqual({
      isMember: false,
    });
  });
});
