/**
 * GameCard - 価値観カードコンポーネント
 * ♠/♥ アイコンなし。左側の太いアクセントボーダーとグラデーション背景でデザインを表現。
 */

interface GameCardProps {
  text: string;
  isDiscardable?: boolean; // 捨てモード（クリック可）
  isSelected?: boolean;    // 選択中
  onSelect?: (cardId: string) => void;
  cardId: string;
  animateIn?: boolean; // 引いた直後
  index?: number; // カラーバリエーション用
}

const accents = [
  "border-l-indigo-500 bg-gradient-to-br from-white to-indigo-50",
  "border-l-violet-500 bg-gradient-to-br from-white to-violet-50",
  "border-l-fuchsia-500 bg-gradient-to-br from-white to-fuchsia-50",
  "border-l-rose-500 bg-gradient-to-br from-white to-rose-50",
  "border-l-amber-500 bg-gradient-to-br from-white to-amber-50",
  "border-l-emerald-500 bg-gradient-to-br from-white to-emerald-50",
  "border-l-sky-500 bg-gradient-to-br from-white to-sky-50",
  "border-l-orange-500 bg-gradient-to-br from-white to-orange-50",
] as const;

export function GameCard({
  text,
  isDiscardable = false,
  isSelected = false,
  onSelect,
  cardId,
  animateIn = false,
  index = 0,
}: GameCardProps) {
  const accentClass = accents[index % accents.length];

  const handleClick = () => {
    if (isDiscardable && onSelect) {
      onSelect(cardId);
    }
  };

  const cardClass = [
    "relative rounded-2xl border border-gray-100 border-l-4 shadow-md",
    accentClass,
    "aspect-[3/4] flex flex-col items-center justify-center p-4",
    isDiscardable
      ? "cursor-pointer hover:shadow-xl hover:scale-[1.03] transition-all duration-200"
      : "transition-shadow duration-200",
    isSelected
      ? "ring-2 ring-red-400 shadow-xl scale-[1.03]"
      : "",
    animateIn ? "animate-card-draw" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cardClass}
      onClick={handleClick}
      role={isDiscardable ? "button" : undefined}
      aria-pressed={isSelected}
    >
      {/* カードナンバー（左上） */}
      <span className="absolute top-2 left-3 text-xs text-gray-300 font-bold select-none">
        {index + 1}
      </span>

      {/* メインテキスト */}
      <p className="text-base font-bold text-gray-800 text-center leading-snug px-2 break-words w-full">
        {text}
      </p>
    </div>
  );
}
