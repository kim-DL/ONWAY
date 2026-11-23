import { MAX_PENDING_PHOTOS_PER_CUSTOMER, MAX_PENDING_PHOTOS_TOTAL } from "./delivery-photo-upload-state";

export const deliveryPhotoCaptureHints = {
  auth: "촬영 권한을 확인하려면 다시 로그인해주세요.",
  catalog: "거래처 정보를 확인해주세요.",
  opening: "기기에 보관된 사진을 확인하고 있어요.",
  reopen: "촬영 대기 · ‘보관함 다시 읽기’를 눌러주세요.",
  reading: "사진을 기기에 보관한 뒤 촬영할 수 있어요.",
  customerLimit: `이 거래처 ${MAX_PENDING_PHOTOS_PER_CUSTOMER}장 대기 · 1장 전송 후 촬영 가능`,
  queueLimit: `전체 대기 사진 ${MAX_PENDING_PHOTOS_TOTAL}장 · 1장 전송 후 촬영 가능`,
  storage: "사진 보관 실패 · 저장 상태에서 보관을 다시 시도해주세요.",
  capacity: "대기 사진을 전송해 보관 공간을 확보해주세요.",
};

export type DeliveryPhotoCaptureBlock = keyof typeof deliveryPhotoCaptureHints;
