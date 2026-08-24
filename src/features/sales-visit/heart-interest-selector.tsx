import type { InterestScore } from "@/domain/sales";

export const INTEREST_META: Record<InterestScore, { label: string; description: string; hearts: number }> = {
  0: { label: "관심도 미확인", description: "빈 하트를 명시적으로 선택", hearts: 0 },
  20: { label: "관심 낮음", description: "아직 탐색 단계", hearts: 1 },
  40: { label: "관심 보통", description: "정보를 더 확인하는 단계", hearts: 2 },
  60: { label: "관심 있음", description: "제품에 관심을 보인 단계", hearts: 3 },
  80: { label: "구체 검토", description: "조건을 구체적으로 검토", hearts: 4 },
  100: { label: "도입 협의", description: "도입을 논의하는 단계", hearts: 5 },
};

export function interestHearts(score: InterestScore | null) {
  const count = score === null ? 0 : INTEREST_META[score].hearts;
  return `${"♥".repeat(count)}${"♡".repeat(5 - count)}`;
}

export function HeartInterestSelector({
  value,
  onChange,
}: {
  value: InterestScore | null;
  onChange: (score: InterestScore) => void;
}) {
  const filled = value === null ? 0 : INTEREST_META[value].hearts;
  return (
    <fieldset className="heart-interest-selector">
      <legend>제품 관심도 <em>필수</em></legend>
      <div className="heart-interest-selector__scale" role="radiogroup" aria-label="제품 관심도">
        {[1, 2, 3, 4, 5].map((stage) => {
          const score = (stage * 20) as InterestScore;
          return (
            <button
              key={score}
              type="button"
              role="radio"
              aria-checked={value === score}
              aria-label={`제품 관심도 5단계 중 ${stage}단계, ${INTEREST_META[score].label}`}
              data-filled={stage <= filled}
              data-selected={value === score}
              onClick={() => onChange(score)}
            >
              <span aria-hidden="true">{stage <= filled ? "♥" : "♡"}</span>
            </button>
          );
        })}
      </div>
      <button
        className="heart-interest-selector__unknown"
        type="button"
        role="radio"
        aria-checked={value === 0}
        data-selected={value === 0}
        onClick={() => onChange(0)}
      >
        <span aria-hidden="true">♡♡♡♡♡</span>
        <strong>관심도 미확인 선택</strong>
      </button>
      <p className="heart-interest-selector__meaning" role="status">
        {value === null
          ? <><strong>아직 선택하지 않았어요.</strong><span>빈 하트도 직접 선택해야 저장할 수 있습니다.</span></>
          : <><strong>{INTEREST_META[value].label}</strong><span>{INTEREST_META[value].description}</span></>}
      </p>
    </fieldset>
  );
}
