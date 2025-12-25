import { respondWithJSON } from "./json";

import { type ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import { getBearerToken, validateJWT } from "../auth";
import { getVideo, updateVideo, type Video } from "../db/videos";
import path from "node:path";
import { uploadVideoToS3 } from "../s3";
import { rm } from "fs/promises";

export async function handlerUploadVideo(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);

  console.log("uploading video ", videoId, "by user", userID);

  const video = getVideo(cfg.db, videoId);
  if (!video) {
    throw new NotFoundError("Couldn't find video");
  }
  if (video.userID !== userID) {
    throw new UserForbiddenError("You do not own this video");
  }

  const formData = await req.formData();
  const file = formData.get("video");
  if (!(file instanceof File)) {
    throw new BadRequestError("Video file missing");
  }

  const MAX_UPLOAD_SIZE = 1 << 30;
  if (file.size > MAX_UPLOAD_SIZE) {
    throw new BadRequestError("Video file too large");
  }

  const mediaType = file.type;
  if (mediaType !== "video/mp4") {
    throw new BadRequestError("Unsupported video media type");
  }

  const extension = ".mp4";
  const fileName = `${videoId}${extension}`;
  const tempPath = path.join("/tmp", fileName);

  await Bun.write(tempPath, file);

  const aspectRatio = await getVideoAspectRatio(tempPath);
  const processedVideo = await processVideoForFastStart(tempPath);

  const key = `${aspectRatio}/${fileName}`;
  await uploadVideoToS3(cfg, key, processedVideo, mediaType);

  video.videoURL = `https://${cfg.s3CfDistribution}/${key}`;

  updateVideo(cfg.db, video);

  await Promise.all([
    rm(tempPath, { force: true }),
    rm(`${tempPath}.processed.mp4`, { force: true }),
  ]);

  return respondWithJSON(200, video);
}

export async function getVideoAspectRatio(filePath: string) {
  const proc = Bun.spawn(
    [
      "ffprobe",
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "json",
      filePath,
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
    }
  );
  const output = await new Response(proc.stdout).text();
  const errors = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`ffprobe failed: ${errors}`);
  }

  const ffprobeResult = JSON.parse(output);
  const width = ffprobeResult.streams[0].width;
  const height = ffprobeResult.streams[0].height;

  if (!width || !height) {
    throw new Error("Could not determine video dimensions");
  }

  const ratio = width / height;
  if (ratio > 1.4) {
    return "landscape";
  }
  if (ratio < 0.8) {
    return "portrait";
  }
  return "other";
}

export async function processVideoForFastStart(filePath: string) {
  const processedFilePath = `${filePath}.processed.mp4`;
  const proc = Bun.spawn(
    [
      "ffmpeg",
      "-i",
      filePath,
      "-movflags",
      "faststart",
      "-map_metadata",
      "0",
      "-codec",
      "copy",
      "-f",
      "mp4",
      processedFilePath,
    ],
    { stderr: "pipe" }
  );

  const errors = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`ffmpeg processing failed: ${errors}`);
  }

  return processedFilePath;
}
