/**
 * DeckCard — 山札・捨て札を「カードスタック」として表示するコンポーネント
 * Tailwind CSS のみ使用。外部依存なし。
 */

interface DeckCardProps {
  count: number;
  label: string;           // "山札" | "捨て札"
  source: "deck" | "other";
  disabled: boolean;
  isLoading?: boolean;
}

export function DeckCard({
  count,
  label,
  source,
  disabled,
  isLoading,
}: DeckCardProps) {
  const isDeck = source === "deck";
  const isEmpty = count === 0;
  const isDisabled = disabled || isEmpty;

  // 色テーマ
  const colors = isDeck
    ? {
        base: "from-indigo-700 to-indigo-900",
        shadow1: "bg-indigo-600",
        shadow2: "bg-indigo-500",
        pulse: "animate-deck-pulse",
      }
    : {
        base: "from-violet-700 to-violet-900",
        shadow1: "bg-violet-600",
        shadow2: "bg-violet-500",
        pulse: "",  // 捨て札はパルスなし
      };

  return (
    <button
      type="submit"
      disabled={isDisabled}
      aria-label={`${label}から引く (${count}枚)`}
      className={[
        "relative group block",
        // サイズ: 幅固定、高さはアスペクト比
        "w-24",
        // ホバー・パルス
        "deck-card-hover",
        !isDisabled ? colors.pulse : "",
        isDisabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
      ].filter(Boolean).join(" ")}
    >
      {/* スタック影カード（後ろ側 2 枚） */}
      <div
        aria-hidden
        className={`absolute inset-0 rounded-xl ${colors.shadow2} translate-x-[7px] translate-y-[7px]`}
        style={{ aspectRatio: "2/3" }}
      />
      <div
        aria-hidden
        className={`absolute inset-0 rounded-xl ${colors.shadow1} translate-x-[4px] translate-y-[4px]`}
        style={{ aspectRatio: "2/3" }}
      />

      {/* 表面カード */}
      <div
        className={[
          "relative rounded-xl overflow-hidden",
          "bg-gradient-to-br",
          colors.base,
          // スタック分のオフセット余白
          "mb-[7px] mr-[7px]",
        ].join(" ")}
        style={{ aspectRatio: "2/3" }}
      >
        {/* 菱形格子パターン（SVG data URL） */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Cpath d='M10 0 L20 10 L10 20 L0 10 Z' fill='none' stroke='white' stroke-width='0.8' stroke-opacity='0.15'/%3E%3C/svg%3E")`,
            backgroundSize: "20px 20px",
          }}
        />

        {/* 内枠ボーダー装飾 */}
        <div className="absolute inset-2 rounded-lg border border-white/10" />

        {/* 中央: Align ブランドイニシャル */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="text-4xl font-black select-none"
            style={{ color: "rgba(255,255,255,0.12)" }}
          >
            A
          </span>
        </div>

        {/* 下部: ラベル + 枚数 */}
        <div className="absolute bottom-0 left-0 right-0 pb-3 flex flex-col items-center gap-0.5">
          <span className="text-[9px] font-bold tracking-widest text-white/50 uppercase">
            {label}
          </span>
          {isLoading ? (
            <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          ) : (
            <span className="text-white font-black text-xl leading-none">
              {count}
            </span>
          )}
          <span className="text-[9px] text-white/40">枚</span>
        </div>
      </div>

      {/* ホバーヒント */}
      <div
        aria-hidden
        className="absolute -bottom-5 left-0 right-0 text-center text-[10px] text-gray-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none whitespace-nowrap"
      >
        {!isDisabled && "タップして引く"}
      </div>
    </button>
  );
}
