import { onCall } from "firebase-functions/v2/https";

export {
  downloadCsvExport,
  expireCsvExports,
  exportCsv,
  getCsvExportOptions,
  previewCsvExport,
} from "./export/callables.js";
import { setGlobalOptions } from "firebase-functions/v2/options";

export { employeeLogin, employeeLogout } from "./auth/callables.js";
export { listCustomers, saveCustomer, searchCustomerLocations, reverseCustomerLocation } from "./customer/callables.js";
export { uploadCustomerPhoto, getCustomerPhoto, expireCustomerPhotos } from "./customer/customer-photo-callables.js";
export {
  createDeliveryPhoto,
  deleteDeliveryPhoto,
  expireDeliveryPhotos,
  getDeliveryPhoto,
  getDeliveryPhotoDay,
  getDeliveryPhotoRoute,
  listDeliveryPhotos,
  saveDeliveryPhotoDay,
  saveDeliveryPhotoRoute,
} from "./delivery-photo/delivery-photo-callables.js";
export {
  getInventoryContext, listInventoryProducts, getInventoryProduct, saveInventoryProduct,
  recordInventoryMovement, recordInventoryCount, updateInventoryLot,
  setInventoryProductStatus, deleteInventoryProduct, updateInventorySettings,
  listInventoryHistory, listInventoryManufacturers, createInventoryManufacturer, updateInventoryManufacturer,
  uploadInventoryPhoto, getInventoryPhoto, expireInventoryPhotos,
} from "./inventory/callables.js";
export {
  activateAdminSession,
  createEmployee,
  getAdminWorkspace,
  listAdminAuditLogs,
  reserveEmployeePin,
  revokeEmployeeSessions,
  rotateEmployeePin,
  updateEmployee,
  updateActivityTags,
  updatePublicAppSettings,
} from "./admin/callables.js";
export { updateSchoolFieldProfile } from "./field/callables.js";
export {
  deleteSchoolPhoto,
  finalizePhotoUpload,
  getSchoolPhoto,
  preparePhotoUpload,
  restoreSchoolPhoto,
} from "./photo/callables.js";
export {
  changeSalesAssignment,
  claimSalesAssignments,
  createSalesAssignments,
  createSalesCycle,
  optimizeSalesRoute,
  recordSalesVisit,
  releaseSalesAssignments,
  updateSalesVisit,
  updateSalesCyclePromotedProducts,
  updateSalesProfile,
} from "./sales/callables.js";
export {
  applyNeisSchoolSync,
  confirmKakaoMatch,
  matchSchoolWithKakao,
  previewNeisSchoolSync,
} from "./sync/callables.js";

setGlobalOptions({
  region: "asia-northeast3",
  maxInstances: 10,
});

export const phase0Health = onCall(
  { enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true" },
  () => ({
    service: "onnuriway-functions",
    status: "ok",
    version: 1,
  }),
);
