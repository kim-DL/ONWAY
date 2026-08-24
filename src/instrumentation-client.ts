import { initializeClientPerformanceMonitoring } from "@/lib/performance/performance-monitor";

try {
  initializeClientPerformanceMonitoring();
} catch {
  // Diagnostics must never delay hydration or prevent the app from starting.
}
