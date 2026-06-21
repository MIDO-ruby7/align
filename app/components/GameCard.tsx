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
        // ベーススタイル
        "relative rounded-xl bg-white border border-gray-200 overflow-hidden",
        "aspect-[3/4] flex flex-col select-none",
        // シャドウ（リアルなカード感）
        "shadow-[0_2px_8px_rgba(0,0,0,0.10)]",
        // 状態別スタイル
        isDiscardable && !isDiscarding
          ? "cursor-pointer hover:shadow-[0_8px_24px_rgba(0,0,0,0.16)] hover:-translate-y-1 hover:border-gray-300 transition-all duration-150 active:scale-[0.97]"
          : "transition-all duration-150",
        // アニメーション
        animateIn ? "animate-card-draw" : "",
        isDiscarding ? "opacity-50 animate-card-discard" : "",
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
      {/* 上辺アクセントバー */}
      <div className={`h-[3px] w-full flex-shrink-0 ${accentBar}`} />

      {/* テキストエリア */}
      <div className="flex-1 flex items-center justify-center px-3 py-2">
        <p className="text-sm font-bold text-gray-800 text-center leading-snug break-words w-full">
          {text || "…"}
        </p>
      </div>

      {/* 下部: 捨てるヒント（捨てモード時のみ） */}
      {isDiscardable && (
        <div className="pb-2 flex justify-center">
          <span className="text-[10px] font-semibold text-gray-300 tracking-wide">
            {isDiscarding ? "..." : "タップして捨てる"}
          </span>
        </div>
      )}
    </div>
  );
}
