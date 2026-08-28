/**
 * Entry point bundled for the performance sync script.
 *
 * Re-exports the application's own performance code so the sync writes rows
 * through the same mapping the Worker uses. Hand-rolling forty columns of
 * `game_device_performance` in a shell script would be a second implementation
 * to keep correct, and this audit has already produced enough defects of
 * exactly that kind.
 */
export { syncGameDevicePerformance } from "@/lib/devicePerformance.server";
export { getDevicePerformanceList, validateGameDevicePerformance } from "@/lib/devicePerformance";
export { d1All, d1Run } from "@/lib/d1.server";
