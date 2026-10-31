import { createRoot } from "react-dom/client";
import { AppShell } from "../../../src/features/app-shell/app-shell";
import { session } from "./inventory-settings-data";

localStorage.setItem(`onnuriway:private:v1:mode:${session.uid}`, "inventory");
createRoot(document.getElementById("root")!).render(<AppShell session={session} />);
