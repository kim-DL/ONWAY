import { z } from "zod";

const requiredSourceText = z.string().trim().min(1).max(500);
const optionalSourceText = z.string().nullish().transform((value) => value?.trim() ?? "");

export const neisSchoolRowSchema = z
  .object({
    ATPT_OFCDC_SC_CODE: requiredSourceText.max(20),
    ATPT_OFCDC_SC_NM: optionalSourceText,
    SD_SCHUL_CODE: requiredSourceText.max(30),
    SCHUL_NM: requiredSourceText.max(200),
    ENG_SCHUL_NM: optionalSourceText,
    SCHUL_KND_SC_NM: requiredSourceText.max(100),
    LCTN_SC_NM: optionalSourceText,
    JU_ORG_NM: optionalSourceText,
    FOND_SC_NM: optionalSourceText,
    ORG_RDNZC: optionalSourceText,
    ORG_RDNMA: optionalSourceText,
    ORG_RDNDA: optionalSourceText,
    ORG_TELNO: optionalSourceText,
    HMPG_ADRES: optionalSourceText,
    LOAD_DTM: optionalSourceText,
  })
  .passthrough();

export const neisResultSchema = z.object({
  CODE: z.string().trim().min(1).max(50),
  MESSAGE: z.string().trim().max(500),
});

export type NeisSchoolRow = z.infer<typeof neisSchoolRowSchema>;
export type NeisResult = z.infer<typeof neisResultSchema>;

export interface NeisSchoolPage {
  totalCount: number;
  rows: NeisSchoolRow[];
}
