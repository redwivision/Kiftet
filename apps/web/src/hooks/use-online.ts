import { useSyncExternalStore } from "react";
import {
  getConnectivityServerSnapshot,
  getConnectivitySnapshot,
  subscribeToConnectivity,
} from "@/lib/connectivity";

// Whether KIFTET'S PLATFORM is reachable — not the browser's opinion of the
// device. The shared store in `lib/connectivity` owns the single `/health`
// heartbeat, so every component gets the same answer without each one running
// its own probe.
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeToConnectivity,
    getConnectivitySnapshot,
    getConnectivityServerSnapshot,
  );
}
