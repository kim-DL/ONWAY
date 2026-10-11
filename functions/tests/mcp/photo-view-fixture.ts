import { PHOTO_VIEW_HTML } from "../../src/mcp/photo-view.js";

// Synthetic photos use October 7 captions. Keep them within their 168-hour
// retention window on any CI date, while timers still advance in real time.
const epoch = Date.parse("2026-10-08T00:00:00.000Z");
export const PHOTO_TEST_HTML = PHOTO_VIEW_HTML.replace("<script>(()=>{",
  `<script>{const actualNow=Date.now,started=actualNow();Date.now=()=>${epoch}+actualNow()-started;}</script><script>(()=>{`);
