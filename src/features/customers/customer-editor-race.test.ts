import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

import { customerDraftSchema, type CustomerDraft, type CustomerRegion, type LocationCandidate } from "@/domain/customer";

const source = ts.createSourceFile("customer-editor.tsx", readFileSync(new URL("./customer-editor.tsx", import.meta.url), "utf8"), ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
function callback(name: string, context: Record<string, unknown>) {
  let declaration: ts.VariableDeclaration | ts.FunctionDeclaration | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) declaration = node;
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) declaration = node;
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!declaration) throw new Error(`Missing editor callback ${name}`);
  const definition = ts.isVariableDeclaration(declaration) ? `const ${declaration.getText(source)};` : declaration.getText(source);
  const compiled = ts.transpileModule(`${definition}; globalThis.callback = ${name};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandbox = createContext(context);
  runInContext(compiled, sandbox);
  return sandbox.callback as (...input: unknown[]) => unknown;
}
function beforeCloseCallback(context: Record<string, unknown>) {
  let expression: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && node.name.getText(source) === "beforeClose" && node.initializer && ts.isJsxExpression(node.initializer)) expression = node.initializer.expression;
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!expression) throw new Error("Missing editor beforeClose callback");
  const compiled = ts.transpileModule(`globalThis.callback = ${expression.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandbox = createContext(context);
  runInContext(compiled, sandbox);
  return sandbox.callback as () => boolean;
}
function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const draft: CustomerDraft = { name: "강은유통", district: "서구", administrativeDong: "탄방동", officialAddress: "기존 공식 주소", deliveryAddress: "기존 납품 주소",
  accessPassword: "", accessPasswordState: "none", deliveryLocationDescription: "", deliveryPoint: { latitude: 36.35, longitude: 127.38 },
  contacts: [], status: "active", noticeType: "new", changeNote: "" };
const candidate: LocationCandidate = { id: "one", name: "검색한 창고", address: "대전광역시 중구 새 주소 1", point: { latitude: 36.4, longitude: 127.4 } };

function locationContext() {
  let currentDraft = { ...draft };
  const context = {
    draft: currentDraft, latitude: "36.35", longitude: "127.38",
    active: { current: true }, saving: { current: false }, uncertainSave: { current: false }, locationSequence: { current: 0 }, requestId: { current: null },
    changed: vi.fn(), setLatitude: vi.fn(), setLongitude: vi.fn(), setLocationResults: vi.fn(), setLocationMessage: vi.fn(),
    setLocationBusy: vi.fn(), setAddressBusy: vi.fn(), setAddressPending: vi.fn(), setManualAddress: vi.fn(), setAddressMessage: vi.fn(),
    addressBusy: false, locationBusy: false,
    setDraft: vi.fn((update: (current: CustomerDraft) => CustomerDraft) => { currentDraft = update(currentDraft); }),
    parsePoint: (latitude: string, longitude: string) => ({ latitude: Number(latitude), longitude: Number(longitude) }),
    customerRepository: { reverseLocation: vi.fn(() => new Promise(() => {})) },
  };
  return { context, current: () => currentDraft };
}

describe("customer editor address-first location workflow", () => {
  it("initializes new records with empty regions and preserves legacy regions for edits", () => {
    const initialize = callback("initialDraft", {});
    expect(initialize(null)).toMatchObject({ district: "", administrativeDong: "" });
    expect(initialize(null)).toMatchObject({ accessPasswordState: "none", accessPassword: "" });
    expect(initialize(draft)).toMatchObject({ district: "서구", administrativeDong: "탄방동", officialAddress: draft.officialAddress, deliveryAddress: draft.deliveryAddress });
    expect(initialize({ ...draft, accessPasswordState: "unknown" })).toMatchObject({ accessPasswordState: "unknown" });
  });
  it("has no region or redundant delivery-address inputs in the normal workflow", () => {
    expect(source.text).not.toContain('textField("자치구"');
    expect(source.text).not.toContain('textField("행정동"');
    expect(source.text).not.toContain('textField("실제 납품 주소"');
    expect(source.text).not.toContain('setLocationQuery');
    expect(source.text).toContain('manualAddress ? textField("납품 주소 직접 보완 (선택)"');
    expect(source.text).toContain('data-confirm-delivery-point');
  });
  it("selects an address and actual point without carrying over a previous region", async () => {
    const state = locationContext();
    await callback("selectLocation", state.context)(candidate);
    expect(state.current()).toMatchObject({ district: "", administrativeDong: "", officialAddress: candidate.address, deliveryAddress: candidate.address, deliveryPoint: candidate.point });
    expect(state.context.customerRepository.reverseLocation).toHaveBeenCalledWith(candidate.point);
    expect(state.context.setLocationResults).toHaveBeenCalledWith([]);
  });
  it("enriches the selected point's region in the background without replacing its street address", async () => {
    const state = locationContext();
    const region = deferred<CustomerRegion>();
    const context = { ...state.context, customerRepository: { reverseLocation: vi.fn(() => region.promise) } };
    callback("selectLocation", context)(candidate);
    expect(state.current()).toMatchObject({ deliveryAddress: candidate.address, district: "", administrativeDong: "" });
    region.resolve({ address: "다른 지번 주소", district: " 중구 ", administrativeDong: " 선화동 " });
    await Promise.resolve();
    expect(state.current()).toMatchObject({ officialAddress: candidate.address, deliveryAddress: candidate.address, district: "중구", administrativeDong: "선화동" });
  });
  it.each(["pin-moved", "editor-closed", "save-started", "retry-only"])("ignores a late selected-place region after %s", async (reason) => {
    const state = locationContext();
    const region = deferred<CustomerRegion>();
    const context = { ...state.context, customerRepository: { reverseLocation: vi.fn(() => region.promise) } };
    callback("selectLocation", context)(candidate);
    context.setDraft.mockClear();
    if (reason === "pin-moved") context.locationSequence.current += 1;
    if (reason === "editor-closed") context.active.current = false;
    if (reason === "save-started") context.saving.current = true;
    if (reason === "retry-only") context.uncertainSave.current = true;
    region.resolve({ address: "", district: "중구", administrativeDong: "선화동" });
    await Promise.resolve();
    expect(context.setDraft).not.toHaveBeenCalled();
  });
  it("keeps selected coordinates usable when background region lookup fails", async () => {
    const state = locationContext();
    const context = { ...state.context, customerRepository: { reverseLocation: vi.fn().mockRejectedValue(new Error("offline")) } };
    callback("selectLocation", context)(candidate);
    await Promise.resolve(); await Promise.resolve();
    expect(state.current()).toMatchObject({ deliveryAddress: candidate.address, deliveryPoint: candidate.point, district: "", administrativeDong: "" });
    expect(context.setAddressBusy).toHaveBeenLastCalledWith(false);
    expect(context.setAddressPending).toHaveBeenCalledWith(false);
  });
  it("clears a previous point's address on pin move and waits for explicit confirmation", async () => {
    const state = locationContext();
    await callback("changePoint", state.context)(candidate.point);
    expect(state.current()).toMatchObject({ district: "", administrativeDong: "", deliveryAddress: "", deliveryPoint: candidate.point });
    expect(state.context.locationSequence.current).toBe(1);
    expect(state.context.customerRepository.reverseLocation).not.toHaveBeenCalled();
    expect(state.context.setAddressPending).toHaveBeenCalledWith(true);
  });
  it("accepts coordinate entry without triggering region lookups", async () => {
    const state = locationContext();
    await callback("setCoordinate", state.context)("latitude", "36.4");
    expect(state.current()).toMatchObject({ district: "", administrativeDong: "", deliveryAddress: "", deliveryPoint: { latitude: 36.4, longitude: 127.38 } });
    expect(state.context.customerRepository.reverseLocation).not.toHaveBeenCalled();
  });
  it("does not carry over an old address when a place result has none", async () => {
    const state = locationContext();
    await callback("selectLocation", state.context)({ ...candidate, address: "" });
    expect(state.current().deliveryAddress).toBe("");
    expect(state.context.setAddressPending).toHaveBeenCalledWith(true);
  });
  it("resolves the confirmed pin to a street address without overwriting the official address", async () => {
    const state = locationContext();
    const context = { ...state.context, customerRepository: { reverseLocation: vi.fn().mockResolvedValue({ district: "중구", administrativeDong: "선화동", address: candidate.address }) } };
    await callback("confirmLocation", context)();
    expect(context.customerRepository.reverseLocation).toHaveBeenCalledWith(draft.deliveryPoint);
    expect(state.current()).toMatchObject({ officialAddress: draft.officialAddress, deliveryAddress: candidate.address, district: "중구", administrativeDong: "선화동" });
    expect(context.setAddressPending).toHaveBeenCalledWith(false);
    expect(context.setManualAddress).toHaveBeenLastCalledWith(false);
  });
  it.each(["empty", "unavailable"])("offers manual fallback if reverse lookup is %s", async (reason) => {
    const state = locationContext();
    const reverseLocation = reason === "empty" ? vi.fn().mockResolvedValue({ address: "", district: "", administrativeDong: "" }) : vi.fn().mockRejectedValue(new Error("network"));
    const context = { ...state.context, customerRepository: { reverseLocation }, customerErrorMessage: () => "주소를 확인하지 못했어요." };
    await callback("confirmLocation", context)();
    expect(context.setAddressPending).toHaveBeenCalledWith(false);
    expect(context.setManualAddress).toHaveBeenLastCalledWith(true);
    expect(context.setAddressMessage).toHaveBeenLastCalledWith(expect.stringContaining("위치만 저장"));
  });
  it.each(["pin-moved", "editor-closed", "save-started", "retry-only"])("ignores reverse address arriving after %s", async (reason) => {
    const state = locationContext();
    const result = deferred<CustomerRegion>();
    const context = { ...state.context, customerRepository: { reverseLocation: vi.fn(() => result.promise) } };
    const pending = callback("confirmLocation", context)();
    context.setDraft.mockClear();
    if (reason === "pin-moved") context.locationSequence.current += 1;
    if (reason === "editor-closed") context.active.current = false;
    if (reason === "save-started") context.saving.current = true;
    if (reason === "retry-only") context.uncertainSave.current = true;
    result.resolve({ district: "중구", administrativeDong: "선화동", address: candidate.address });
    await pending;
    expect(context.setDraft).not.toHaveBeenCalled();
  });
  it.each(["addressPending", "addressBusy"])("prevents save while %s before touching the repository", async (key) => {
    const save = vi.fn();
    const context = { draft, saving: { current: false }, photoReading: { current: false }, latitude: "36.35", longitude: "127.38", parsePoint: () => draft.deliveryPoint,
      addressPending: false, addressBusy: false, [key]: true, setError: vi.fn(), formRef: { current: null }, customerRepository: { save } };
    await callback("submit", context)({ preventDefault: vi.fn() });
    expect(save).not.toHaveBeenCalled();
    expect(context.setError).toHaveBeenCalled();
  });
  it.each(["during-save", "after-failure"] as const)("ignores a late place search and preserves the submitted snapshot and retry key (%s)", async (timing) => {
    const search = deferred<LocationCandidate[]>();
    const save = deferred<unknown>();
    const context = {
      draft, customer: null, customerDraftSchema, latitude: "36.35", longitude: "127.38",
      photoSelection: null, photoRemoved: false, photoReading: { current: false }, uploadedPhoto: { current: null }, setSaveStage: vi.fn(),
      active: { current: true }, saving: { current: false }, uncertainSave: { current: false }, locationSequence: { current: 0 },
      requestId: { current: "790d4c21-50fa-49f3-b0b3-e804588b5c16" }, formRef: { current: null },
      locationBusy: false, addressBusy: false, addressPending: false, setLocationResults: vi.fn(),
      customerRepository: { searchLocations: vi.fn(() => search.promise), save: vi.fn(() => save.promise) },
      customerErrorMessage: () => "연결을 확인해주세요.", isCustomerPhotoStageError: () => false,
      parsePoint: () => draft.deliveryPoint, setLocationMessage: vi.fn(), setLocationBusy: vi.fn(), setDraft: vi.fn(),
      setBusy: vi.fn(), setDirty: vi.fn(), setError: vi.fn(), setFieldErrors: vi.fn(), onSaved: vi.fn(), setRetryOnly: vi.fn(), saveMayHaveCompleted: () => true,
    };
    const searchTask = callback("findLocations", context)();
    context.setLocationResults.mockClear();
    const submit = callback("submit", context);
    const saveTask = submit({ preventDefault: vi.fn() });
    expect(context.saving.current).toBe(true);
    expect(context.customerRepository.save).toHaveBeenCalledWith(expect.objectContaining({ requestId: context.requestId.current, draft: expect.objectContaining({ administrativeDong: "탄방동" }) }));
    if (timing === "after-failure") { save.reject(new Error("network")); await saveTask; }
    search.resolve([candidate]);
    await searchTask;
    expect(context.setDraft).not.toHaveBeenCalled();
    expect(context.setLocationResults).not.toHaveBeenCalled();
    expect(context.requestId.current).toBe("790d4c21-50fa-49f3-b0b3-e804588b5c16");
    if (timing === "during-save") { save.reject(new Error("network")); await saveTask; }
    expect(context.uncertainSave.current).toBe(true);
    expect(context.setRetryOnly).toHaveBeenCalledWith(true);
    await submit({ preventDefault: vi.fn() });
    expect(context.customerRepository.save).toHaveBeenNthCalledWith(2, expect.objectContaining({ requestId: "790d4c21-50fa-49f3-b0b3-e804588b5c16", draft: expect.objectContaining({ administrativeDong: "탄방동" }) }));
  });
});

function photoSaveContext(overrides: Partial<CustomerDraft> = {}) {
  return {
    draft: { ...draft, ...overrides }, customer: null, customerDraftSchema, latitude: "36.35", longitude: "127.38",
    active: { current: true }, saving: { current: false }, uncertainSave: { current: false }, locationSequence: { current: 0 },
    requestId: { current: "790d4c21-50fa-49f3-b0b3-e804588b5c16" }, formRef: { current: null },
    photoSelection: null as { file: File; uploadId: string } | null, photoRemoved: false, photoReading: { current: false },
    uploadedPhoto: { current: null as { uploadId: string } | null }, setSaveStage: vi.fn(),
    customerRepository: { save: vi.fn().mockResolvedValue({ customerId: "saved" }) },
    customerPhotoRepository: { upload: vi.fn().mockResolvedValue({ uploadId: "650d4c21-50fa-49f3-b0b3-e804588b5c16", width: 400, height: 300 }) },
    customerErrorMessage: () => "거래처 저장 오류", customerPhotoErrorMessage: () => "사진 업로드 오류",
    isCustomerPhotoStageError: vi.fn(() => false), setPhotoSelection: vi.fn(), crypto: { randomUUID: vi.fn(() => "fa5cda0d-a31b-4aaf-bb15-e8492a7dbac2") },
    parsePoint: () => draft.deliveryPoint, addressBusy: false, addressPending: false,
    setLocationBusy: vi.fn(), setLocationMessage: vi.fn(), setBusy: vi.fn(), setDirty: vi.fn(), setError: vi.fn(),
    setFieldErrors: vi.fn(), onSaved: vi.fn(), setRetryOnly: vi.fn(), saveMayHaveCompleted: () => true,
  };
}
const photoSelection = () => ({ file: new File(["photo"], "front.jpg", { type: "image/jpeg" }), uploadId: "650d4c21-50fa-49f3-b0b3-e804588b5c16" });
describe("customer editor photo transaction and simpler fields", () => {
  it.each(["no-previous-photo", "previous-selection", "previous-upload"] as const)("does not upload or save an old snapshot while a new photo is being read (%s)", async (previous) => {
    const context = photoSaveContext();
    if (previous !== "no-previous-photo") context.photoSelection = photoSelection();
    if (previous === "previous-upload") context.uploadedPhoto.current = { uploadId: context.photoSelection!.uploadId };
    context.photoReading.current = true;
    const requestId = context.requestId.current;
    const event = { preventDefault: vi.fn() };
    await callback("submit", context)(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(context.customerPhotoRepository.upload).not.toHaveBeenCalled();
    expect(context.customerRepository.save).not.toHaveBeenCalled();
    expect(context.setBusy).not.toHaveBeenCalled();
    expect(context.setSaveStage).not.toHaveBeenCalled();
    expect(context.saving.current).toBe(false);
    expect(context.requestId.current).toBe(requestId);
  });
  it("can save the completed new selection after reading finishes", async () => {
    const context = photoSaveContext();
    context.photoReading.current = true;
    const submit = callback("submit", context);
    await submit({ preventDefault: vi.fn() });
    context.photoSelection = photoSelection();
    context.photoReading.current = false;
    await submit({ preventDefault: vi.fn() });
    expect(context.customerPhotoRepository.upload).toHaveBeenCalledOnce();
    expect(context.customerPhotoRepository.upload).toHaveBeenCalledWith(context.photoSelection.file, context.photoSelection.uploadId);
    expect(context.customerRepository.save).toHaveBeenCalledOnce();
    expect(context.customerRepository.save).toHaveBeenCalledWith(expect.objectContaining({ photoChange: { action: "replace", uploadId: context.photoSelection.uploadId } }));
  });
  it.each([false, true])("treats photo reading as unsaved changes for cancel and sheet dismissal (confirmation=%s)", (confirmed) => {
    const context = { busy: false, dirty: false, photoReading: { current: true }, uncertainSave: { current: false }, window: { confirm: vi.fn(() => confirmed) }, onClose: vi.fn() };
    callback("close", context)();
    expect(context.window.confirm).toHaveBeenCalledWith("저장하지 않은 변경사항이 있어요. 닫을까요?");
    expect(context.onClose).toHaveBeenCalledTimes(confirmed ? 1 : 0);
    context.window.confirm.mockClear();
    expect(beforeCloseCallback(context)()).toBe(confirmed);
    expect(context.window.confirm).toHaveBeenCalledOnce();
  });
  it("dismisses an unchanged editor without a warning when no photo is being read", () => {
    const context = { busy: false, dirty: false, photoReading: { current: false }, uncertainSave: { current: false }, window: { confirm: vi.fn(() => false) }, onClose: vi.fn() };
    callback("close", context)();
    expect(context.onClose).toHaveBeenCalledOnce();
    expect(beforeCloseCallback(context)()).toBe(true);
    expect(context.window.confirm).not.toHaveBeenCalled();
  });
  it("requires an explicit decision for legacy unknown password state before any upload or save", async () => {
    const context = photoSaveContext({ accessPasswordState: "unknown" });
    context.photoSelection = photoSelection();
    await callback("submit", context)({ preventDefault: vi.fn() });
    expect(context.customerRepository.save).not.toHaveBeenCalled();
    expect(context.customerPhotoRepository.upload).not.toHaveBeenCalled();
    expect(context.setFieldErrors).toHaveBeenCalledWith(expect.objectContaining({ accessPasswordState: expect.any(String) }));
  });
  it.each(["none", "new", "changed"] as const)("keeps the displayed notice choice %s authoritative", async (noticeType) => {
    const context = photoSaveContext({ noticeType });
    await callback("submit", context)({ preventDefault: vi.fn() });
    expect(context.customerRepository.save).toHaveBeenCalledWith(expect.objectContaining({ draft: expect.objectContaining({ noticeType }), clearNotice: noticeType === "none" }));
  });
  it("does not create a customer or lock editing when photo upload fails", async () => {
    const context = photoSaveContext();
    context.photoSelection = photoSelection();
    context.customerPhotoRepository.upload.mockRejectedValueOnce(new Error("network"));
    await callback("submit", context)({ preventDefault: vi.fn() });
    expect(context.customerRepository.save).not.toHaveBeenCalled();
    expect(context.setRetryOnly).toHaveBeenCalledWith(false);
    expect(context.uncertainSave.current).toBe(false);
    expect(context.setError).toHaveBeenCalledWith("사진 업로드 오류");
  });
  it("uploads once and retries the same photo reference and save request after lost customer response", async () => {
    const context = photoSaveContext();
    context.photoSelection = photoSelection();
    context.customerRepository.save.mockRejectedValueOnce(new Error("response lost"));
    const submit = callback("submit", context);
    await submit({ preventDefault: vi.fn() });
    expect(context.uncertainSave.current).toBe(true);
    expect(context.setRetryOnly).toHaveBeenCalledWith(true);
    await submit({ preventDefault: vi.fn() });
    expect(context.customerPhotoRepository.upload).toHaveBeenCalledTimes(1);
    expect(context.customerPhotoRepository.upload).toHaveBeenCalledWith(context.photoSelection.file, context.photoSelection.uploadId);
    expect(context.customerRepository.save).toHaveBeenCalledTimes(2);
    const first = context.customerRepository.save.mock.calls[0]![0];
    expect(first).toMatchObject({ requestId: context.requestId.current, photoChange: { action: "replace", uploadId: context.photoSelection.uploadId } });
    expect(context.customerRepository.save.mock.calls[1]![0]).toEqual(first);
  });
  it("recovers from an explicitly rejected expired photo without reusing its cached stage or losing the file", async () => {
    const context = photoSaveContext();
    context.photoSelection = photoSelection();
    const originalSelection = context.photoSelection;
    context.isCustomerPhotoStageError.mockReturnValue(true);
    context.customerRepository.save.mockRejectedValueOnce({ code: "functions/failed-precondition", details: { reason: "customer-photo-stage" } });
    const submit = callback("submit", context);
    await submit({ preventDefault: vi.fn() });
    expect(context.uncertainSave.current).toBe(false);
    expect(context.setRetryOnly).toHaveBeenCalledWith(false);
    expect(context.uploadedPhoto.current).toBeNull();
    expect(context.requestId.current).toBeNull();
    expect(context.setPhotoSelection).toHaveBeenCalledWith({ file: originalSelection.file, uploadId: "fa5cda0d-a31b-4aaf-bb15-e8492a7dbac2" });
    expect(context.setError).toHaveBeenCalledWith(expect.stringContaining("재업로드"));
    context.photoSelection = context.setPhotoSelection.mock.calls[0]![0];
    context.isCustomerPhotoStageError.mockReturnValue(false);
    await submit({ preventDefault: vi.fn() });
    expect(context.customerPhotoRepository.upload).toHaveBeenCalledTimes(2);
    expect(context.customerPhotoRepository.upload).toHaveBeenLastCalledWith(originalSelection.file, "fa5cda0d-a31b-4aaf-bb15-e8492a7dbac2");
    expect(context.onSaved).toHaveBeenCalledOnce();
  });
  it("does not save after an upload returns to an unmounted editor", async () => {
    const context = photoSaveContext();
    context.photoSelection = photoSelection();
    const upload = deferred<{ uploadId: string; width: number; height: number }>();
    context.customerPhotoRepository.upload.mockReturnValueOnce(upload.promise);
    const pending = callback("submit", context)({ preventDefault: vi.fn() });
    context.active.current = false;
    upload.resolve({ uploadId: context.photoSelection.uploadId, width: 400, height: 300 });
    await pending;
    expect(context.customerRepository.save).not.toHaveBeenCalled();
  });
  it("removes a photo only with the customer save and never starts a new upload", async () => {
    const context = photoSaveContext();
    context.photoRemoved = true;
    await callback("submit", context)({ preventDefault: vi.fn() });
    expect(context.customerPhotoRepository.upload).not.toHaveBeenCalled();
    expect(context.customerRepository.save).toHaveBeenCalledWith(expect.objectContaining({ photoChange: { action: "remove" } }));
  });
  it("omits photoChange when the existing photo was not touched", async () => {
    const context = photoSaveContext();
    await callback("submit", context)({ preventDefault: vi.fn() });
    expect(context.customerRepository.save.mock.calls[0]![0]).not.toHaveProperty("photoChange");
  });
});
