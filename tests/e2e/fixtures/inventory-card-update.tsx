import { createRoot } from "react-dom/client";
import { InventoryWorkspace } from "../../../src/features/inventory/inventory-workspace";
import { commitInventoryCatalog, getInventoryWorkspaceSession, updateInventoryWorkspaceUi } from "../../../src/features/inventory/inventory-workspace-snapshot";
import { context, products, session } from "./inventory-card-update-data";

const namespace = `${session.uid}:1:1`;
getInventoryWorkspaceSession(namespace);
commitInventoryCatalog(namespace, { context, products, observedDate: context.today, freshness: "fresh", lastSuccessAt: Date.now() });
updateInventoryWorkspaceUi(namespace, { limit: products.length });
createRoot(document.getElementById("root")!).render(<div className="workspace-content" style={{ height: "100dvh", overflowY: "auto" }}>
  <InventoryWorkspace session={session} />
</div>);
