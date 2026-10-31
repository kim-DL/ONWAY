import { createRoot } from "react-dom/client";
import { AppShell } from "../../../src/features/app-shell/app-shell";
import { session } from "./customer-ceramic-data";

localStorage.setItem(`onnuriway:private:v1:mode:${session.uid}`, new URLSearchParams(location.search).get("mode") === "inventory" ? "inventory" : "customer");
createRoot(document.getElementById("root")!).render(<AppShell session={session} />);
