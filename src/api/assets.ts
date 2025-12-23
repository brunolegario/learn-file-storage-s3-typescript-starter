import { existsSync, mkdirSync } from "fs";

import type { ApiConfig } from "../config";
import path from "node:path";

export function ensureAssetsDir(cfg: ApiConfig) {
  if (!existsSync(cfg.assetsRoot)) {
    mkdirSync(cfg.assetsRoot, { recursive: true });
  }
}

export function mediaTypeToExtension(mediaType: string) {
  const parts = mediaType.split("/");
  if (parts.length !== 2) {
    return ".bin";
  }
  return `.${parts[1].toLowerCase()}`;
}

export function getAssetDiskPath(cfg: ApiConfig, fileName: string) {
  return path.join(cfg.assetsRoot, fileName);
}

export function getAssetURL(cfg: ApiConfig, fileName: string) {
  return `http://localhost:${cfg.port}/assets/${fileName}`;
}
