/**
 * GameCard - 価値観カードコンポーネント
 * ネオブルータリスト × ぷにぷにポップデザイン
 * colored border バリエーション (4色ローテーション)
 */
import { useFetcher } from "react-router";

const cardBorders = [
  "border-[#ff71ce]",
  "border-[#00bd76]",
  "border-[#e7e482]",
  "border-[#880069]",
] as const;

interface GameCardProps {
  cardId: string;
  text: string;
  index: number;
  animateIn?: boolean;
  isDiscardable?: boolean; // 捨てモード（自分のターンかつ手札6枚）
  roomId?: string; // discard 時に必要
}

export function GameCard({
  cardId,
  text,
  index,
  animateIn,
  isDiscardable,
  roomId,
}: GameCardProps) {
  const discardFetcher = useFetcher({ key: `discard-card-${cardId}` });
  const isDiscarding = discardFetcher.state !== "idle";
  const borderColor = cardBorders[index % cardBorders.length];

  return (
    <div
      className={[
        // ベーススタイル
        "relative bg-white border-2 rounded-2xl neo-shadow",
        "aspect-[2/3] flex flex-col items-center justify-center p-4 select-none",
        borderColor,
        // 捨てモード
        isDiscardable && !isDiscarding
          ? "cursor-pointer game-card-discardable"
          : "",
        // アニメーション
        animateIn ? "animate-card-draw" : "",
        isDiscarding ? "opacity-40 animate-card-discard pointer-events-none" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => {
        if (isDiscardable && !isDiscarding && roomId) {
          discardFetcher.submit(
            { cardId },
            { method: "post", action: `/api/rooms/${roomId}/turns/discard` },
          );
        }
      }}
      role={isDiscardable ? "button" : undefined}
      aria-label={isDiscardable ? `${text} を捨てる` : undefined}
    >
      {/* 捨てモード時の SELECT バッジ */}
      {isDiscardable && !isDiscarding && (
        <div className="absolute -top-2 -right-2 bg-[#e7e482] border-2 border-[#1a1c1b] rounded-full px-2 py-0.5 neo-shadow z-10">
          <span className="text-[10px] font-black text-[#1a1c1b] tracking-wide">
            SELECT
          </span>
        </div>
      )}

      {/* テキストエリア */}
      <p
        className={[
          "font-bold text-center leading-snug break-words w-full text-base",
          isDiscardable ? "text-[#1a1c1b]" : "text-[#1a1c1b]",
        ].join(" ")}
      >
        {text || "…"}
      </p>

      {/* 捨てモード時の下部ヒント */}
      {isDiscardable && (
        <div className="absolute bottom-2.5 left-0 right-0 flex justify-center">
          <span className="text-[10px] font-bold text-[#880069] tracking-wide">
            {isDiscarding ? "捨て中…" : "タップして捨てる"}
          </span>
        </div>
      )}
    </div>
  );
}
