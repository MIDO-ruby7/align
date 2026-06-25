/**
 * シードスクリプト: master_cards テーブルに価値観ワード 50 枚を投入する。
 *
 * スペース作成時に master_cards から cards テーブルへコピーする設計。
 *
 * 実行方法:
 *   pnpm db:seed
 */

import { drizzle } from "drizzle-orm/d1";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { masterCards, cards } from "./schema/index";
import { MASTER_CARD_WORDS } from "./master-card-words";
import type * as schema from "./schema/index";

// transaction コールバック内でも通常の db と同じ型を持つ
type AnyDB = DrizzleD1Database<typeof schema> | ReturnType<typeof drizzle>;

export { MASTER_CARD_WORDS };

/**
 * スペース作成時に master_cards を cards テーブルへコピーする。
 * T4 実装者は `import { seedSpaceCards } from "../db/seed"` で利用可能。
 */
export async function seedSpaceCards(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: AnyDB | any,
  spaceId: string,
): Promise<void> {
  const masters = await db.select().from(masterCards).where(eq(masterCards.isActive, true));
  if (masters.length === 0) return;
  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = masters.map((m: any) => ({
    id: crypto.randomUUID(),
    spaceId,
    text: m.text,
    isActive: true,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  }));
  // D1 は 1 クエリあたり最大 100 パラメータ制限があるため
  // 6 カラム × 15 行 = 90 パラメータ以内でバッチ処理する
  const BATCH_SIZE = 15;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    await db.insert(cards).values(rows.slice(i, i + BATCH_SIZE));
  }
}

export async function seed(db: ReturnType<typeof drizzle>) {
  const now = new Date();

  const rows = MASTER_CARD_WORDS.map((word, i) => ({
    id: `mc-${String(i + 1).padStart(3, "0")}`,
    text: word,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }));

  await db.insert(masterCards).values(rows).onConflictDoNothing();

  console.log(`Seeded ${rows.length} master cards.`);
}
