import { APP_METADATA } from "@/lib/app-metadata";
import {
  getPerformanceSnapshot,
  type PerformanceSnapshot,
} from "@/lib/performance/performance-monitor";

export type PilotDeviceDiagnostics = {
  schemaVersion: 1;
  appVersion: string;
  capturedAt: string;
  deviceState: {
    online: boolean;
    installed: boolean;
  };
  performance: PerformanceSnapshot;
};

export function createPilotDeviceDiagnostics(input: {
  online: boolean;
  installed: boolean;
  capturedAt?: Date;
  performance?: PerformanceSnapshot;
}): PilotDeviceDiagnostics {
  return {
    schemaVersion: 1,
    appVersion: APP_METADATA.buildVersion,
    capturedAt: (input.capturedAt ?? new Date()).toISOString(),
    deviceState: {
      online: input.online,
      installed: input.installed,
    },
    performance: input.performance ?? getPerformanceSnapshot(),
  };
}

export function serializePilotDeviceDiagnostics(diagnostics: PilotDeviceDiagnostics) {
  return `${JSON.stringify(diagnostics, null, 2)}\n`;
}
