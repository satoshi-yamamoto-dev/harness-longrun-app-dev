export type {
  AdapterCommandResult,
  AdapterOperation,
  AdapterStartOptions,
  PackageManager,
  ProjectAdapter,
  ProjectDetection,
  RunningProject,
} from "./types.js";
export { detectWebProject } from "./web/detect.js";
export { AdapterStartError, WebProjectAdapter } from "./web/web-project-adapter.js";
