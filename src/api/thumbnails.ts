import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import path from "node:path";
import { getAssetDiskPath, getAssetURL, mediaTypeToExtension } from "./assets";
import { randomBytes } from "node:crypto";

export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log("uploading thumbnail for video", videoId, "by user", userID);

  const video = getVideo(cfg.db, videoId);
  if (!video) {
    throw new NotFoundError("Couldn't find video");
  }
  if (video.userID !== userID) {
    throw new UserForbiddenError("You do not own this video");
  }

  const formData = await req.formData();
  const file = formData.get("thumbnail");
  if (!(file instanceof File)) {
    throw new BadRequestError("Thumbnail file missing");
  }

  const MAX_UPLOAD_SIZE = 10 << 20;
  if (file.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError("Thumbnail file too large");
  }

  const mediaType = file.type;
  if (mediaType !== "image/png" && mediaType !== "image/jpeg") {
    throw new BadRequestError("Unsupported thumbnail media type");
  }

  const extension = mediaTypeToExtension(mediaType);
  const randomName = randomBytes(32).toString("base64url");
  const fileName = `${randomName}${extension}`;

  const assetPath = getAssetDiskPath(cfg, fileName);
  await Bun.write(assetPath, file);

  const assetURL = getAssetURL(cfg, fileName);
  video.thumbnailURL = assetURL;

  updateVideo(cfg.db, video);

  return respondWithJSON(200, video);
}
