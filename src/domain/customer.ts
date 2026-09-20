// Shared pure client/server contract. This module has no Firebase Admin imports.
export {
  CUSTOMER_COMPANY_ID, CUSTOMER_COLLECTION_PATH, customerContactSchema,
  customerDraftSchema, customerSchema, customerPointSchema,
  customerListPageSchema, customerLocationCandidateSchema, customerRegionSchema,
  saveCustomerInputSchema, normalizeCustomerName, getCustomerChoseong,
  CUSTOMER_PHOTO_MAX_BYTES, CUSTOMER_PHOTO_CONTENT_TYPES, customerOverviewPhotoSchema,
  customerPhotoUploadResultSchema, customerPhotoDownloadSchema, getCustomerPhotoInputSchema,
} from "../../functions/src/customer/customer-contract";
export type {
  Customer, CustomerDraft, CustomerContact, CustomerPoint, SaveCustomerInput,
  LocationCandidate, CustomerRegion,
} from "../../functions/src/customer/customer-contract";
