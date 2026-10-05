import type { SchoolFieldProfile, SchoolFieldProfilePatch } from "@/domain/school";

const EMPTY_PROFILE = {
  contacts: { dietitianPhone: null, cafeteriaPhone: null },
  cafeteria: {
    building: null,
    floor: null,
    locationDescription: null,
    entranceDescription: null,
    routeDescription: null,
  },
  inspection: { startTime: null, endTime: null, note: null },
  equipment: { cartRequired: "unknown", elevator: "unknown", stairsRequired: "unknown" },
  fieldNotes: null,
} as const satisfies Pick<
  SchoolFieldProfile,
  "contacts" | "cafeteria" | "inspection" | "equipment" | "fieldNotes"
>;

export type EditorSection = "all" | "contacts" | "cafeteria" | "salesLocation" | "inspection" | "equipment" | "fieldNotes";

export function profileSection(profile: SchoolFieldProfile | null, section: EditorSection) {
  const source = profile ?? EMPTY_PROFILE;
  // Preserve cart/stair values when sales changes only the visible elevator.
  if (section === "salesLocation") return { cafeteria: { ...source.cafeteria }, equipment: { ...source.equipment } } satisfies SchoolFieldProfilePatch;
  if (section === "all") {
    return {
      contacts: { ...source.contacts },
      cafeteria: { ...source.cafeteria },
      inspection: { ...source.inspection },
      equipment: { ...source.equipment },
      fieldNotes: source.fieldNotes,
    } satisfies SchoolFieldProfilePatch;
  }
  if (section === "fieldNotes") return { fieldNotes: source.fieldNotes };
  return { [section]: source[section] } as SchoolFieldProfilePatch;
}
