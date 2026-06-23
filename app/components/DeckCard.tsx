/**
 * DeckCard — 山札・捨て札を「カードスタック」として表示するコンポーネント
 * ネオブルータリスト × ぷにぷにポップデザイン
 * 山札: ミントグリーン背景にピンクの雲模様 + 「A」ロゴ
 * 捨て札: シンプルなオフホワイト背景
 */

interface DeckCardProps {
  count: number;
  label: string;           // "山札" | "捨て札"
  source: "deck" | "other";
  disabled: boolean;
  isLoading?: boolean;
}

// 雲模様 SVG data URL パターン
const cloudPattern = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='40'%3E%3Cellipse cx='20' cy='25' rx='18' ry='12' fill='%23ff71ce' opacity='0.6'/%3E%3Cellipse cx='35' cy='20' rx='15' ry='10' fill='%23ff71ce' opacity='0.5'/%3E%3Cellipse cx='50' cy='28' rx='14' ry='9' fill='%23ff71ce' opacity='0.4'/%3E%3C/svg%3E")`;

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

  return (
    <button
      type="submit"
      disabled={isDisabled}
      aria-label={`${label}から引く (${count}枚)`}
      className={[
        "relative group block",
        "w-24",
        "deck-card-hover",
        isDeck && !isDisabled ? "animate-deck-pulse" : "",
        isDisabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
      ].filter(Boolean).join(" ")}
    >
      {/* スタック影カード（後ろ側） */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-2xl bg-[#1a1c1b] translate-x-[6px] translate-y-[6px]"
        style={{ aspectRatio: "2/3" }}
      />

      {/* 表面カード */}
      {isDeck ? (
        // 山札: ミントグリーン + 雲模様
        <div
          className="relative rounded-2xl overflow-hidden border-4 border-[#1a1c1b] mb-[6px] mr-[6px]"
          style={{
            aspectRatio: "2/3",
            background: "#9cf5be",
            backgroundImage: cloudPattern,
            backgroundSize: "60px 40px",
          }}
        >
          {/* 中央ロゴ */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className="text-5xl font-black text-white/70"
              style={{ fontFamily: "Quicksand" }}
            >
              A
            </span>
          </div>

          {/* 枚数 */}
          <div className="absolute bottom-2 left-0 right-0 text-center">
            {isLoading ? (
              <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin mx-auto" />
            ) : (
              <span
                className="text-white font-black text-2xl"
                style={{ fontFamily: "Quicksand" }}
              >
                {count}
              </span>
            )}
            <p className="text-white/60 text-xs">枚</p>
          </div>
        </div>
      ) : (
        // 捨て札: 白背景 + ボーダー
        <div
          className="relative rounded-2xl overflow-hidden border-4 border-[#1a1c1b] bg-white mb-[6px] mr-[6px]"
          style={{ aspectRatio: "2/3" }}
        >
          {/* DISCARD ラベル */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            <div className="w-8 h-8 border-2 border-[#1a1c1b]/30 rounded-lg flex items-center justify-center">
              <span className="text-[#1a1c1b]/30 text-lg">&#128465;</span>
            </div>
            <p className="text-[8px] font-black text-[#1a1c1b]/40 tracking-widest uppercase">
              {label}
            </p>
          </div>

          {/* 枚数 */}
          <div className="absolute bottom-2 left-0 right-0 text-center">
            {isLoading ? (
              <div className="w-4 h-4 rounded-full border-2 border-[#1a1c1b]/20 border-t-[#1a1c1b] animate-spin mx-auto" />
            ) : (
              <span
                className="text-[#1a1c1b] font-black text-2xl"
                style={{ fontFamily: "Quicksand" }}
              >
                {count}
              </span>
            )}
            <p className="text-[#1a1c1b]/40 text-xs">枚</p>
          </div>
        </div>
      )}

      {/* ホバーヒント */}
      <div
        aria-hidden
        className="absolute -bottom-5 left-0 right-0 text-center text-[10px] text-[#1a1c1b]/40 font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none whitespace-nowrap"
      >
        {!isDisabled && "タップして引く"}
      </div>
    </button>
  );
}
