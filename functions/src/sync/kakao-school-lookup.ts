import { KakaoLocalClientError, type KakaoAddressResult, type KakaoLocalClient } from "./kakao-local-client.js";
import { decideKakaoSchoolMatch, schoolAddressQuery } from "./kakao-school-matcher.js";
import type { StoredSchool } from "./school-sync-types.js";

/** Address lookup helps rank places; it is not itself proof of school identity. */
export async function lookupKakaoSchool(
  school: StoredSchool,
  client: Pick<KakaoLocalClient, "searchAddress" | "searchKeyword">,
) {
  const officialAddress = school.address.road ?? school.address.jibun;
  if (!officialAddress) throw new Error("An official address is required.");
  let addressResult: KakaoAddressResult | null = null;
  try {
    addressResult = await client.searchAddress(schoolAddressQuery(officialAddress, school.name));
  } catch (error) {
    // Authorization/quota failures affect both endpoints. Do not multiply those
    // requests. A local address timeout/malformed response may still be recovered
    // by one keyword lookup with exact official name/address matching (90 points).
    if (!(error instanceof KakaoLocalClientError)
      || (error.httpStatus !== undefined && [401, 403, 429].includes(error.httpStatus))) throw error;
  }
  const candidates = await client.searchKeyword({ query: `${school.name} 대전`, origin: addressResult });
  return decideKakaoSchoolMatch({ school, addressResult, candidates });
}
