import { describe, it, expect } from "vitest";
import {
  secureShuffleSlice,
  getCurrentTurnPlayer,
  checkGameFinished,
  distributeInitialHands,
  assignSeatOrders,
} from "../../app/lib/game-logic";

/**
 * ゲームロジック ユニットテスト
 * AC-1: サンプリング・配布ロジック
 * AC-2: ターン担当計算
 * AC-4/5: 終了判定
 */

// ---------------------------------------------------------------------------
// secureShuffleSlice
// ---------------------------------------------------------------------------
describe("secureShuffleSlice (AC-1: ランダムサンプリング)", () => {
  const cards = Array.from({ length: 20 }, (_, i) => ({ id: `card-${i}` }));

  it("指定枚数が返る", () => {
    const result = secureShuffleSlice(cards, 10);
    expect(result).toHaveLength(10);
  });

  it("元配列より多い count の場合は元配列の全要素を返す", () => {
    const result = secureShuffleSlice(cards, 100);
    expect(result).toHaveLength(20);
  });

  it("count=0 の場合は空配列", () => {
    expect(secureShuffleSlice(cards, 0)).toHaveLength(0);
  });

  it("返される要素は元の配列に含まれる要素のみ", () => {
    const ids = new Set(cards.map((c) => c.id));
    const result = secureShuffleSlice(cards, 10);
    for (const item of result) {
      expect(ids.has(item.id)).toBe(true);
    }
  });

  it("重複なし", () => {
    const result = secureShuffleSlice(cards, 10);
    const ids = result.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("元配列を変更しない（副作用なし）", () => {
    const original = [...cards.map((c) => c.id)];
    secureShuffleSlice(cards, 10);
    expect(cards.map((c) => c.id)).toEqual(original);
  });

  it("複数回実行すると異なる順序が返る（ランダム性確認）", () => {
    const results = Array.from({ length: 10 }, () =>
      secureShuffleSlice(cards, 5).map((c) => c.id).join(","),
    );
    const unique = new Set(results);
    expect(unique.size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// distributeInitialHands
// ---------------------------------------------------------------------------
describe("distributeInitialHands (AC-1: 初期手札配布)", () => {
  const players = [
    { id: "p1" },
    { id: "p2" },
    { id: "p3" },
  ];
  const deck = Array.from({ length: 20 }, (_, i) => ({ id: `card-${i}` }));

  it("各プレイヤーに handSize 枚ずつ配布される", () => {
    const result = distributeInitialHands(players, deck, 5);
    for (const pid of players.map((p) => p.id)) {
      expect(result[pid]).toHaveLength(5);
    }
  });

  it("配布されたカードは重複しない", () => {
    const result = distributeInitialHands(players, deck, 5);
    const allCards = Object.values(result).flat().map((c) => c.id);
    expect(new Set(allCards).size).toBe(allCards.length);
  });

  it("デッキが足りない場合は残りを等分する", () => {
    // 3人 × 5枚 = 15枚必要なのに10枚しかない
    const smallDeck = deck.slice(0, 10);
    const result = distributeInitialHands(players, smallDeck, 5);
    const totalDistributed = Object.values(result).flat().length;
    expect(totalDistributed).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// assignSeatOrders
// ---------------------------------------------------------------------------
describe("assignSeatOrders (AC-1: seat_order 確定)", () => {
  const players = [
    { id: "p1" },
    { id: "p2" },
    { id: "p3" },
  ];

  it("全プレイヤーに seat_order が割り当てられる", () => {
    const result = assignSeatOrders(players);
    expect(result).toHaveLength(3);
    for (const item of result) {
      expect(typeof item.seatOrder).toBe("number");
    }
  });

  it("seat_order は 0 から始まる連番 (0, 1, 2, ...)", () => {
    const result = assignSeatOrders(players);
    const orders = result.map((r) => r.seatOrder).sort((a, b) => a - b);
    expect(orders).toEqual([0, 1, 2]);
  });

  it("全プレイヤーの id が保持される", () => {
    const result = assignSeatOrders(players);
    const ids = result.map((r) => r.id).sort();
    expect(ids).toEqual(["p1", "p2", "p3"]);
  });
});

// ---------------------------------------------------------------------------
// getCurrentTurnPlayer
// ---------------------------------------------------------------------------
describe("getCurrentTurnPlayer (AC-2: ターン担当計算)", () => {
  const players = [
    { id: "p1", seatOrder: 0 },
    { id: "p2", seatOrder: 1 },
    { id: "p3", seatOrder: 2 },
  ];

  it("ターン番号 0 は seat_order=0 のプレイヤー", () => {
    expect(getCurrentTurnPlayer(players, 0)).toEqual({ id: "p1", seatOrder: 0 });
  });

  it("ターン番号 1 は seat_order=1 のプレイヤー", () => {
    expect(getCurrentTurnPlayer(players, 1)).toEqual({ id: "p2", seatOrder: 1 });
  });

  it("ターン番号がプレイヤー数以上の場合はローテーション（modulo）", () => {
    // 3人で turnNumber=3 → seat_order=0
    expect(getCurrentTurnPlayer(players, 3)).toEqual({ id: "p1", seatOrder: 0 });
    expect(getCurrentTurnPlayer(players, 4)).toEqual({ id: "p2", seatOrder: 1 });
    expect(getCurrentTurnPlayer(players, 5)).toEqual({ id: "p3", seatOrder: 2 });
  });

  it("プレイヤーが1人の場合は常に同じプレイヤー", () => {
    const solo = [{ id: "p1", seatOrder: 0 }];
    expect(getCurrentTurnPlayer(solo, 0)).toEqual({ id: "p1", seatOrder: 0 });
    expect(getCurrentTurnPlayer(solo, 99)).toEqual({ id: "p1", seatOrder: 0 });
  });
});

// ---------------------------------------------------------------------------
// checkGameFinished
// ---------------------------------------------------------------------------
describe("checkGameFinished (AC-4/5: 終了判定)", () => {
  it("deck と other が両方空なら finished=true", () => {
    expect(checkGameFinished({ deckCount: 0, otherCount: 0 })).toBe(true);
  });

  it("deck が空でも other が残っていれば finished=false", () => {
    expect(checkGameFinished({ deckCount: 0, otherCount: 3 })).toBe(false);
  });

  it("deck が残っていれば finished=false", () => {
    expect(checkGameFinished({ deckCount: 5, otherCount: 0 })).toBe(false);
  });

  it("どちらも残っていれば finished=false", () => {
    expect(checkGameFinished({ deckCount: 5, otherCount: 3 })).toBe(false);
  });
});
