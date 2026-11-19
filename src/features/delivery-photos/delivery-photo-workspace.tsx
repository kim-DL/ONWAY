"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useRef, useState } from "react";

import { LoadingStatus } from "@/components/ui/loading-status";
import type { Customer } from "@/domain/customer";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { searchCustomers } from "@/features/customers/customer-search";

import { projectDeliveryPhotoCompletion, resolveDeliveryPhotoDayCustomerIds } from "./delivery-photo-domain";
import { DeliveryPhotoHistoryLoader } from "./delivery-photo-history-loader";
import type { DeliveryPhotoCaptureEntryState } from "./delivery-photo-capture-entry";
import { DeliveryPhotoInputController, type DeliveryPhotoInputControllerHandle } from "./delivery-photo-input-controller";
import { mergeConfirmedDeliveryPhoto, deliveryPhotoDateKey } from "./delivery-photo-memory";
import { useDeliveryPhotoData } from "./use-delivery-photo-data";
import { useDeliveryPhotoCatalog } from "./use-delivery-photo-catalog";
import { useDeliveryPhotoUploads } from "./use-delivery-photo-uploads";
import type { DeliveryPhotoEditorMode } from "./delivery-photo-editor";
import styles from "./photo.module.css";

const WorkspacePhotoToolbar = dynamic(() => import("./delivery-photo-toolbar").then((entry) => entry.WorkspacePhotoToolbar), { ssr: false });
const WorkspacePhotoGallery = dynamic(() => import("./delivery-photo-toolbar").then((entry) => entry.WorkspacePhotoGallery));
const DeliveryPhotoCaptureEntry = dynamic(() => import("./delivery-photo-capture-entry"), { ssr: false });
const ContinuousCapture = dynamic(() => import("./delivery-photo-capture-entry").then((entry) => entry.ContinuousCapture), { ssr: false });
const DirectionsLink = dynamic(() => import("../customers/customer-directions-link"), { ssr: false });
const DeliveryPhotoSearchResults = dynamic(() => import("./delivery-photo-search-results"), { ssr: false });
const DeliveryPhotoDayLists = dynamic(() => import("./delivery-photo-day-lists"), { ssr: false });
const DeliveryPhotoRow = dynamic(() => import("./delivery-photo-row"), { ssr: false });
const DeliveryPhotoEditor = dynamic(() => import("./delivery-photo-editor").then((entry) => entry.WorkspaceOrderEditor), { ssr: false });
const DeliveryPhotoMoreMenu = dynamic(() => import("./delivery-photo-more-menu"));
const DeliveryPhotoUploadPanel = dynamic(() => import("./delivery-photo-upload-panel"), { ssr: false });

export function DeliveryPhotoWorkspace({ session, onOpenCustomerDetail, requestedCustomerId, onReturnToCustomer, galleryOpen, onOpenGallery }: {
  session: AuthenticatedSession;
  onOpenCustomerDetail?: (customerId: string) => void;
  requestedCustomerId?: string | undefined;
  onReturnToCustomer?: (() => void) | undefined;
  galleryOpen?: boolean;
  onOpenGallery?: () => void;
}) {
  const data = useDeliveryPhotoData(session);
  const snapshot = data.snapshot;
  const catalog = useDeliveryPhotoCatalog(session, data.clear);
  const inputs = useRef<DeliveryPhotoInputControllerHandle>(null);
  const acceptData = data.accept; const refreshData = data.refresh;
  const acceptConfirmed = useCallback((photo: Parameters<typeof mergeConfirmedDeliveryPhoto>[1]) => {
    if (photo.deliveryDateKey !== deliveryPhotoDateKey()) { refreshData(); return; }
    acceptData((current) => mergeConfirmedDeliveryPhoto(current, photo));
  }, [acceptData, refreshData]);
  const uploads = useDeliveryPhotoUploads(session, acceptConfirmed, Boolean(snapshot), refreshData);
  const activeCustomers = useMemo(() => catalog.customers.filter((customer) => customer.status === "active"), [catalog.customers]);
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<{ mode: DeliveryPhotoEditorMode; addId?: string; onDone?: () => void } | null>(null);
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const [moreCustomer, setMoreCustomer] = useState<Customer | null>(null);
  const [captureId, setCaptureId] = useState<string | null>(null);
  const [focusJob, setFocusJob] = useState<string | null>(null);
  const originList = useRef<Element | null>(null);
  const rememberList = () => {
    const list = document.activeElement?.closest("[data-photo-list]");
    if (list) originList.current = list;
  };
  const byId = useMemo(() => new Map(activeCustomers.map((customer) => [customer.customerId, customer])), [activeCustomers]);
  const requestedCustomer = requestedCustomerId ? byId.get(requestedCustomerId) : undefined;
  const routeIds = useMemo(() => resolveDeliveryPhotoDayCustomerIds(snapshot?.route?.customerIds ?? [], null, byId), [snapshot?.route?.customerIds, byId]);
  const day = snapshot?.day;
  const todayIds = useMemo(() => resolveDeliveryPhotoDayCustomerIds(routeIds,
    day?.isOverride ? day.customerIds : null, byId), [routeIds, day, byId]);
  const summaries = useMemo(() => new Map(snapshot?.today.customers.map((item) => [item.customerId, item]) ?? []), [snapshot?.today.customers]);
  const completion = useMemo(() => projectDeliveryPhotoCompletion(todayIds,
    (id) => summaries.get(id)?.count ?? 0), [todayIds, summaries]);
  const matches = useMemo(() => query.trim() ? searchCustomers(activeCustomers, query).slice(0, 20) : [], [activeCustomers, query]);
  const showInList = (id: string) => id !== captureId && id !== requestedCustomerId;
  const ready = Boolean(snapshot && catalog.status === "ready");
  const capture = (customer: Customer) => { rememberList(); inputs.current?.openCamera(customer.customerId); };
  const album = (customer: Customer) => { inputs.current?.openAlbum(customer.customerId); };
  const retry = (jobId: string) => { void uploads.coordinator?.retry(jobId); };
  const captureAvailable = (customerId: string) => catalog.status === "ready" && byId.has(customerId) && !data.authBlocked && Boolean(uploads.coordinator?.canBegin(customerId));
  const captureEntry: DeliveryPhotoCaptureEntryState = requestedCustomer
    ? { status: "ready", customer: requestedCustomer, disabled: !captureAvailable(requestedCustomer.customerId), preparing: !uploads.ready && !uploads.storageError }
    : { status: catalog.status === "ready" ? "unavailable" : "loading" };
  const renderRow = (id: string, search = false, directions = false) => {
    const customer = byId.get(id); if (!customer) return null;
    const summary = summaries.get(id);
    return <DeliveryPhotoRow key={id} customer={customer} count={summary?.count} latestAt={summary?.latest?.createdAt}
      {...uploads.byCustomer.get(id)} onShowJob={setFocusJob}
      captureAllowed={captureAvailable(id)} uploadReady={uploads.ready} inToday={todayIds.includes(id)}
      directions={directions && <DirectionsLink customer={customer} className={styles.directions} />}
      onAdd={search ? (customerId) => setEditor({ mode: "day", addId: customerId }) : undefined}
      onView={setHistoryCustomer} onCapture={capture} onMore={(value) => { rememberList(); setMoreCustomer(value); }} onRetry={retry} />;
  };

  return <><section hidden={galleryOpen} className={`shell-page ${styles.workspace}`} aria-labelledby="delivery-photo-heading" data-delivery-photo-workspace>
    <WorkspacePhotoToolbar session={session} customers={activeCustomers} hasToday={todayIds.length > 0} completion={completion}
      data={data} catalog={catalog} uploads={uploads} targetVisible={Boolean(requestedCustomer)} onEdit={setEditor} query={query} onQueryChange={setQuery}
      galleryOpen={galleryOpen} onOpenGallery={onOpenGallery}>
      {requestedCustomerId ? <DeliveryPhotoCaptureEntry state={captureEntry}
        onCamera={() => { if (requestedCustomer) capture(requestedCustomer); }}
        onAlbum={() => { if (requestedCustomer) album(requestedCustomer); }} onReturn={onReturnToCustomer} /> : null}
    </WorkspacePhotoToolbar>
    {query.trim() ? <DeliveryPhotoSearchResults matches={matches} show={showInList}
      renderRow={(id) => renderRow(id, true)} /> : null}
    {!snapshot && data.loading ? <LoadingStatus className={styles.empty} label="오늘 납품처 불러오는 중" detail="오늘 납품 기록을 확인하고 있습니다." /> : null}
    {captureId && captureId !== requestedCustomerId && byId.has(captureId) ? <ContinuousCapture customerId={captureId} origin={originList}
      onFinish={() => setCaptureId(null)}><ul className={styles.list}>{renderRow(captureId)}</ul></ContinuousCapture> : null}
    {uploads.coordinator && uploads.jobs.length ? <DeliveryPhotoUploadPanel coordinator={uploads.coordinator} jobs={uploads.jobs} names={byId} focusJob={focusJob} onFocused={setFocusJob} /> : null}
    {ready ? <DeliveryPhotoDayLists remaining={completion.remainingCustomerIds} completed={completion.completedCustomerIds}
      show={showInList} hasToday={todayIds.length > 0} renderRow={(id, directions) => renderRow(id, false, directions)} /> : null}
    {editor && ready ? <DeliveryPhotoEditor key={`${editor.mode}:${editor.addId ?? ""}`} mode={editor.mode} session={session} customers={activeCustomers}
      initialIds={editor.mode === "route" ? routeIds : todayIds} initialAddId={editor.addId}
      revision={snapshot?.[editor.mode]?.revision}
      data={data} onClose={() => { const onDone = editor.onDone; setEditor(null); onDone?.(); }} /> : null}
    {historyCustomer ? <DeliveryPhotoHistoryLoader key={`${session.uid}:${session.claims.sessionVersion}:${session.claims.permissionsVersion}:${historyCustomer.customerId}`}
      customer={historyCustomer} session={session} onClose={() => setHistoryCustomer(null)} sync={data.accept} /> : null}
    {moreCustomer ? <DeliveryPhotoMoreMenu customer={moreCustomer} albumDisabled={!captureAvailable(moreCustomer.customerId)}
      onAlbum={album} onOpenCustomerDetail={onOpenCustomerDetail} onClose={() => setMoreCustomer(null)} className={styles.moreActions!} /> : null}
    <DeliveryPhotoInputController ref={inputs} coordinator={uploads.coordinator} jobs={uploads.jobs} onSelected={setCaptureId} canSelect={captureAvailable} />
  </section>{galleryOpen && onReturnToCustomer && <WorkspacePhotoGallery session={session} catalog={catalog} data={data} onBack={onReturnToCustomer} />}</>;
}
