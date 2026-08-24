import type { SchoolSearchItem } from "@/domain/catalog";
import { getKoreanInitials, normalizeSearchText } from "./search-normalizer";

export type SearchMatchType =
  | "officialExact"
  | "shortExact"
  | "aliasExact"
  | "officialPrefix"
  | "shortPrefix"
  | "aliasPrefix"
  | "initialsPrefix"
  | "contains"
  | "initialsContains"
  | "fuzzy";

export type SchoolSearchResult = {
  item: SchoolSearchItem;
  matchType: SearchMatchType;
  score: number;
};

type IndexedSchool = {
  item: SchoolSearchItem;
  name: string;
  shortName: string | null;
  aliases: string[];
  initials: string;
  aliasInitials: string[];
};

const MATCH_SCORE: Record<Exclude<SearchMatchType, "fuzzy">, number> = {
  officialExact: 1_000,
  shortExact: 950,
  aliasExact: 900,
  officialPrefix: 850,
  shortPrefix: 800,
  aliasPrefix: 750,
  initialsPrefix: 700,
  contains: 650,
  initialsContains: 600,
};

function boundedEditDistance(left: string, right: string, limit: number): number | null {
  const leftCharacters = Array.from(left);
  const rightCharacters = Array.from(right);
  if (Math.abs(leftCharacters.length - rightCharacters.length) > limit) return null;

  let previous = Array.from({ length: rightCharacters.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= leftCharacters.length; leftIndex += 1) {
    const current = [leftIndex];
    let rowMinimum = leftIndex;
    for (let rightIndex = 1; rightIndex <= rightCharacters.length; rightIndex += 1) {
      const substitutionCost = leftCharacters[leftIndex - 1] === rightCharacters[rightIndex - 1] ? 0 : 1;
      const value = Math.min(
        (current[rightIndex - 1] ?? Number.POSITIVE_INFINITY) + 1,
        (previous[rightIndex] ?? Number.POSITIVE_INFINITY) + 1,
        (previous[rightIndex - 1] ?? Number.POSITIVE_INFINITY) + substitutionCost,
      );
      current[rightIndex] = value;
      rowMinimum = Math.min(rowMinimum, value);
    }
    if (rowMinimum > limit) return null;
    previous = current;
  }

  const distance = previous[rightCharacters.length] ?? Number.POSITIVE_INFINITY;
  return distance <= limit ? distance : null;
}

function isInitialsQuery(query: string) {
  return query.length > 0 && Array.from(query).every((character) => /[ㄱ-ㅎ]/u.test(character));
}

function exactOrPrefixMatch(entry: IndexedSchool, query: string): SchoolSearchResult | null {
  if (entry.name === query) return { item: entry.item, matchType: "officialExact", score: MATCH_SCORE.officialExact };
  if (entry.shortName === query) return { item: entry.item, matchType: "shortExact", score: MATCH_SCORE.shortExact };
  if (entry.aliases.includes(query)) return { item: entry.item, matchType: "aliasExact", score: MATCH_SCORE.aliasExact };
  if (entry.name.startsWith(query)) return { item: entry.item, matchType: "officialPrefix", score: MATCH_SCORE.officialPrefix };
  if (entry.shortName?.startsWith(query)) return { item: entry.item, matchType: "shortPrefix", score: MATCH_SCORE.shortPrefix };
  if (entry.aliases.some((alias) => alias.startsWith(query))) return { item: entry.item, matchType: "aliasPrefix", score: MATCH_SCORE.aliasPrefix };
  if (entry.initials.startsWith(query) || entry.aliasInitials.some((initials) => initials.startsWith(query))) {
    return { item: entry.item, matchType: "initialsPrefix", score: MATCH_SCORE.initialsPrefix };
  }
  if (
    entry.name.includes(query) ||
    entry.shortName?.includes(query) ||
    entry.aliases.some((alias) => alias.includes(query))
  ) {
    return { item: entry.item, matchType: "contains", score: MATCH_SCORE.contains };
  }
  if (entry.initials.includes(query) || entry.aliasInitials.some((initials) => initials.includes(query))) {
    return { item: entry.item, matchType: "initialsContains", score: MATCH_SCORE.initialsContains };
  }
  return null;
}

function fuzzyMatch(entry: IndexedSchool, query: string): SchoolSearchResult | null {
  const queryLength = Array.from(query).length;
  if (queryLength < 3 || isInitialsQuery(query)) return null;
  const limit = queryLength <= 4 ? 1 : 2;
  const candidates = [entry.shortName, ...entry.aliases].filter((value): value is string => value !== null);
  let minimumDistance: number | null = null;
  for (const candidate of candidates) {
    const distance = boundedEditDistance(query, candidate, limit);
    if (distance !== null && (minimumDistance === null || distance < minimumDistance)) {
      minimumDistance = distance;
    }
  }
  if (minimumDistance === null) return null;
  return { item: entry.item, matchType: "fuzzy", score: 500 - minimumDistance * 20 };
}

export class MemorySearchIndex {
  private readonly entries: IndexedSchool[];

  constructor(items: readonly SchoolSearchItem[]) {
    this.entries = items.map((item) => {
      const aliases = item.aliases.map(normalizeSearchText);
      return {
        item,
        name: normalizeSearchText(item.name),
        shortName: item.shortName ? normalizeSearchText(item.shortName) : null,
        aliases,
        initials: normalizeSearchText(item.initials),
        aliasInitials: aliases.map(getKoreanInitials),
      };
    });
  }

  search(input: string, limit = 10): SchoolSearchResult[] {
    const query = normalizeSearchText(input);
    if (query.length === 0 || limit <= 0) return [];

    const directMatches: SchoolSearchResult[] = [];
    const directlyMatchedEntries = new Set<IndexedSchool>();
    for (const entry of this.entries) {
      const match = exactOrPrefixMatch(entry, query);
      if (match) {
        directMatches.push(match);
        directlyMatchedEntries.add(entry);
      }
    }

    const compareMatches = (left: SchoolSearchResult, right: SchoolSearchResult) =>
        right.score - left.score ||
        left.item.normalizedName.localeCompare(right.item.normalizedName, "ko-KR") ||
        left.item.schoolId.localeCompare(right.item.schoolId);

    directMatches.sort(compareMatches);
    if (directMatches.length >= limit) return directMatches.slice(0, limit);

    const fuzzyMatches: SchoolSearchResult[] = [];
    for (const entry of this.entries) {
      if (directlyMatchedEntries.has(entry)) continue;
      const match = fuzzyMatch(entry, query);
      if (match) fuzzyMatches.push(match);
    }
    return [...directMatches, ...fuzzyMatches.sort(compareMatches)].slice(0, limit);
  }
}
