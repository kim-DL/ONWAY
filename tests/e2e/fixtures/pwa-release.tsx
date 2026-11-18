import { createRoot } from "react-dom/client";
import { PwaProvider } from "../../../src/features/pwa/pwa-provider";
import "../../../src/app/styles/pwa.css";

createRoot(document.getElementById("root")!).render(
  <PwaProvider><main><label>현장 메모<textarea /></label></main></PwaProvider>,
);
