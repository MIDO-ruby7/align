/**
 * ゲームロジック ユーティリティ
 * T6: ゲームロジック API
 *
 * Math.random() は使わず crypto.getRandomValues() を使うこと。
 */

/**
 * 配列をセキュアにシャッフルし、先頭 count 要素を返す。
 * 元配列は変更しない。
 */
export function secureShuffleSlice<T>(arr: T[], count: number): T[] {
  const array = [...arr];
  const limit = Math.min(count, array.length);
  for (let i = array.length - 1; i > 0; i--) {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    const j = bytes[0] % (i + 1);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array.slice(0, limit);
}

/**
 * プレイヤー一覧とデッキから、各プレイヤーへ handSize 枚ずつ配布する。
 * デッキが足りない場合は残りのカードを順番に配布する（均等でなくなることがある）。
 *
 * @returns Record<playerId, Card[]>
 */
export function distributeInitialHands<
  P extends { id: string },
  C extends { id: string },
>(
  players: P[],
  deck: C[],
  handSize: number,
): Record<string, C[]> {
  const result: Record<string, C[]> = {};
  for (const p of players) {
    result[p.id] = [];
  }

  let deckIndex = 0;
  // 1枚ずつラウンドロビンで配布
  outer: for (let round = 0; round < handSize; round++) {
    for (const p of players) {
      if (deckIndex >= deck.length) break outer;
      result[p.id].push(deck[deckIndex]);
      deckIndex++;
    }
  }

  return result;
}

/**
 * プレイヤー一覧に座席順（0-indexed）をランダムに割り当てる。
 */
export function assignSeatOrders<P extends { id: string }>(
  players: P[],
): Array<P & { seatOrder: number }> {
  const shuffled = secureShuffleSlice(players, players.length);
  return shuffled.map((p, index) => ({ ...p, seatOrder: index }));
}

/**
 * 現在のターン番号からターン担当プレイヤーを返す。
 * seatOrder の昇順でソートし、turnNumber % playerCount でローテーション。
 */
export function getCurrentTurnPlayer<P extends { id: string; seatOrder: number }>(
  players: P[],
  turnNumber: number,
): P {
  const sorted = [...players].sort((a, b) => a.seatOrder - b.seatOrder);
  const index = turnNumber % sorted.length;
  return sorted[index];
}

/**
 * ゲーム終了判定。
 * discard 後に deck が空になったら終了。
 */
export function checkGameFinished(deckCount: number): boolean {
  return deckCount === 0;
}
