import { createRoot } from "react-dom/client";
import { DeliveryPhotoWorkspace } from "../../../src/features/delivery-photos/delivery-photo-workspace";
import { session } from "./delivery-photo-editor-concurrency-data";

createRoot(document.getElementById("root")!).render(<DeliveryPhotoWorkspace session={session} />);
