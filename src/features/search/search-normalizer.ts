import type { School } from "@/domain/school";

const KOREAN_INITIALS = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
] as const;

const SCHOOL_SUFFIX: Record<School["schoolType"], readonly [string, string] | null> = {
  elementary: ["초등학교", "초"],
  middle: ["중학교", "중"],
  high: ["고등학교", "고"],
  special: ["특수학교", "특수"],
  other: null,
};

export function normalizeDisplayText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export function normalizeSearchText(value: string): string {
  return normalizeDisplayText(value)
    .toLocaleLowerCase("ko-KR")
    .replace(/[\p{Separator}\p{Punctuation}\p{Symbol}]+/gu, "");
}

export function getKoreanInitials(value: string): string {
  return Array.from(normalizeSearchText(value), (character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined || codePoint < 0xac00 || codePoint > 0xd7a3) {
      return character;
    }
    return KOREAN_INITIALS[Math.floor((codePoint - 0xac00) / 588)] ?? character;
  }).join("");
}

export function deriveSchoolShortName(
  name: string,
  schoolType: School["schoolType"],
): string | null {
  const suffix = SCHOOL_SUFFIX[schoolType];
  if (!suffix) return null;

  const displayName = normalizeDisplayText(name);
  if (!displayName.endsWith(suffix[0])) return null;

  let baseName = displayName.slice(0, -suffix[0].length).replace(/^대전/u, "");
  baseName = baseName.replace(/여자$/u, "여").replace(/남자$/u, "남");
  return baseName.length > 0 ? `${baseName}${suffix[1]}` : null;
}

function pushUniqueAlias(
  aliases: string[],
  normalizedAliases: Set<string>,
  value: string | null | undefined,
  officialNormalizedName: string,
) {
  if (!value) return;
  const displayValue = normalizeDisplayText(value);
  const normalizedValue = normalizeSearchText(displayValue);
  if (
    normalizedValue.length === 0 ||
    normalizedValue === officialNormalizedName ||
    normalizedAliases.has(normalizedValue)
  ) {
    return;
  }
  normalizedAliases.add(normalizedValue);
  aliases.push(displayValue);
}

export function deriveCatalogSearchFields(school: School) {
  const displayName = normalizeDisplayText(school.name);
  const normalizedName = normalizeSearchText(displayName);
  const generatedShortName = deriveSchoolShortName(displayName, school.schoolType);
  const shortName = school.shortName
    ? normalizeDisplayText(school.shortName)
    : generatedShortName;
  const aliases: string[] = [];
  const normalizedAliases = new Set<string>();

  for (const alias of school.aliases) {
    pushUniqueAlias(aliases, normalizedAliases, alias, normalizedName);
  }
  pushUniqueAlias(aliases, normalizedAliases, generatedShortName, normalizedName);

  if (displayName.startsWith("대전") && displayName.length > 2) {
    const withoutRegion = displayName.slice(2);
    pushUniqueAlias(aliases, normalizedAliases, withoutRegion, normalizedName);
    const suffix = SCHOOL_SUFFIX[school.schoolType];
    if (suffix && displayName.endsWith(suffix[0])) {
      pushUniqueAlias(
        aliases,
        normalizedAliases,
        `${displayName.slice(0, -suffix[0].length)}${suffix[1]}`,
        normalizedName,
      );
    }
  }

  return {
    name: displayName,
    shortName,
    normalizedName,
    initials: getKoreanInitials(displayName),
    aliases,
  };
}
