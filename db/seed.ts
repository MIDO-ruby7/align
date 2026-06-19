/**
 * シードスクリプト: master_cards テーブルに価値観ワード 50 枚を投入する。
 *
 * スペース作成時に master_cards から cards テーブルへコピーする設計。
 *
 * 実行方法:
 *   pnpm db:seed
 */

import { drizzle } from "drizzle-orm/d1";
import { masterCards } from "./schema/index";
import { MASTER_CARD_WORDS } from "./master-card-words";

export { MASTER_CARD_WORDS };

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
