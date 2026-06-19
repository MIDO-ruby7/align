/**
 * GameCard - トランプ型縦長カードコンポーネント
 */
import { useFetcher } from "react-router";
import { Loader, Trash2 } from "lucide-react";

interface GameCardProps {
  text: string;
  isDiscard?: boolean; // 捨てモード
  canDiscard?: boolean; // 捨てられるか
  onDiscard?: (cardId: string) => void;
  cardId: string;
  animateIn?: boolean; // 引いた直後
  index?: number; // カラーバリエーション用
  roomId?: string;
  discardFetcher?: ReturnType<typeof useFetcher>;
}

const BORDER_COLORS = [
  "border-indigo-400",
  "border-violet-400",
  "border-purple-400",
  "border-fuchsia-400",
  "border-rose-400",
  "border-orange-400",
  "border-amber-400",
  "border-emerald-400",
] as const;

export function GameCard({
  text,
  isDiscard = false,
  canDiscard = false,
  onDiscard,
  cardId,
  animateIn = false,
  index = 0,
  roomId,
  discardFetcher,
}: GameCardProps) {
  const colorClass = BORDER_COLORS[index % BORDER_COLORS.length];

  const discardMode = isDiscard && canDiscard;

  const cardClass = [
    "relative bg-white rounded-2xl shadow-lg border-2 p-3",
    "aspect-[3/4] flex flex-col",
    "transition-transform duration-200",
    colorClass,
    discardMode
      ? "border-red-400 hover:scale-105 cursor-pointer"
      : "",
    animateIn ? "animate-card-draw" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const handleClick = () => {
    if (discardMode && onDiscard) {
      onDiscard(cardId);
    }
  };

  return (
    <div className={cardClass} onClick={handleClick} role={discardMode ? "button" : undefined}>
      {/* 左上コーナー */}
      <div className="flex flex-col items-start leading-none select-none">
        <span className="text-xs font-bold text-gray-400">♠</span>
      </div>

      {/* 中央テキスト */}
      <div className="flex-1 flex items-center justify-center px-1">
        <p className="font-bold text-center text-gray-800 text-sm leading-snug break-words w-full">
          {text}
        </p>
      </div>

      {/* 右下コーナー */}
      <div className="flex flex-col items-end leading-none select-none">
        <span className="text-xs font-bold text-gray-400 rotate-180 inline-block">
          ♥
        </span>
      </div>

      {/* 捨てるボタン（捨てモード時） */}
      {discardMode && roomId && discardFetcher && (
        <discardFetcher.Form
          method="post"
          action={`/api/rooms/${roomId}/turns/discard`}
          className="absolute inset-x-2 bottom-2"
          onClick={(e) => e.stopPropagation()}
        >
          <input type="hidden" name="cardId" value={cardId} />
          <button
            type="submit"
            disabled={discardFetcher.state !== "idle"}
            className="w-full flex items-center justify-center gap-1 py-1 px-2 text-xs rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {discardFetcher.state !== "idle" ? (
              <Loader size={12} className="animate-spin" />
            ) : (
              <Trash2 size={14} />
            )}
            捨てる
          </button>
        </discardFetcher.Form>
      )}
    </div>
  );
}
