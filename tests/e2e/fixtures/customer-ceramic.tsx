import { createRoot } from "react-dom/client";
import { AppShell } from "../../../src/features/app-shell/app-shell";
import { session } from "./customer-ceramic-data";

const mode = new URLSearchParams(location.search).get("mode");
localStorage.setItem(`onnuriway:private:v1:mode:${session.uid}`, mode === "inventory" || mode === "sales" ? mode : "customer");
createRoot(document.getElementById("root")!).render(<AppShell session={session} />);
