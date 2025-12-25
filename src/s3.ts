import type { ApiConfig } from "./config";

export async function uploadVideoToS3(
  cfg: ApiConfig,
  key: string,
  processedVideoPath: string,
  contentType: string
) {
  const s3File = cfg.s3Client.file(key, {
    bucket: cfg.s3Bucket,
  });
  const video = Bun.file(processedVideoPath);
  await s3File.write(video, {
    type: contentType,
  });
}
