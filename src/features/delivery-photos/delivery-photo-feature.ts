// Kept separate from the workspace bundle so disabled builds retain the existing customer shell.
export const DELIVERY_PHOTOS_ENABLED = process.env.NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS === "true";
