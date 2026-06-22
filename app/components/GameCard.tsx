/**
 * GameCard - 価値観カードコンポーネント v2
 * 白背景固定、上辺カラーアクセントバー（8色サイクル）、リアルなカード感
 */
import { useFetcher } from "react-router";

const accentBars = [
  "bg-indigo-500",
  "bg-violet-500",
  "bg-purple-500",
  "bg-fuchsia-500",
  "bg-sky-500",
  "bg-teal-500",
  "bg-amber-500",
  "bg-rose-500",
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
  const accentBar = accentBars[index % accentBars.length];

  return (
    <div
      className={[
        // ベーススタイル（縦比を 2/3 に短縮しカード感を強化）
        "relative rounded-xl overflow-hidden",
        "aspect-[2/3] flex flex-col select-none",
        // 捨てモードと通常で背景・ボーダーを変える
        isDiscardable && !isDiscarding
          ? "bg-amber-50 border-2 border-amber-400 cursor-pointer game-card-discardable"
          : "bg-white border border-gray-200",
        // シャドウ
        isDiscardable && !isDiscarding
          ? "shadow-[0_8px_24px_rgba(0,0,0,0.14)]"
          : "shadow-[0_2px_8px_rgba(0,0,0,0.10)]",
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
      {/* 上辺アクセントバー（太め 6px で視認性向上） */}
      <div className={`h-1.5 w-full flex-shrink-0 ${accentBar}`} />

      {/* テキストエリア */}
      <div className="flex-1 flex items-center justify-center px-3 py-2">
        <p className={[
          "font-bold text-center leading-snug break-words w-full",
          isDiscardable ? "text-base text-gray-800" : "text-base text-gray-800",
        ].join(" ")}>
          {text || "…"}
        </p>
      </div>

      {/* 下部: 捨てるヒント（捨てモード時のみ） */}
      {isDiscardable && (
        <div className="pb-2.5 flex justify-center">
          <span className="text-xs font-semibold text-amber-600 tracking-wide">
            {isDiscarding ? "捨て中…" : "タップして捨てる"}
          </span>
        </div>
      )}
    </div>
  );
}
