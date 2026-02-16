import { unlink } from "node:fs/promises";

export type SatisfyingVideoData = {
  category: string;
  videoId: string;
  duration: number; // In seconds
}

export type YtVideoSegment = {
  videoId: string;
  start: string;
  end: string;
}

const SATISFYING: SatisfyingVideoData[] = [
  {
    category: 'general',
    videoId: 'c0TODv-6G_A',
    duration: 60 * 60
  }
]

async function downloadSatisfyingVideo(segment: YtVideoSegment, folder: string) {
  const url = `https://www.youtube.com/watch?v=${segment.videoId}`;
  // const outputPath = `${folder}/%(title)s.%(ext)s`;
  const outputPath = `${folder}/satisfying.webm`;

  if (process.env.DEBUG !== 'false') {
    const sourceFile = Bun.file(`/assets/debug/satisfying.webm`);
    await Bun.s3.write(outputPath, sourceFile);
    return outputPath;
  }

  const tempPath = `/tmp/video-${Date.now()}.webm`;
  const proc = Bun.spawn([
    "yt-dlp",
    "--js-runtimes", "bun",
    "--download-sections", `*${segment.start}-${segment.end}`,
    "-o", tempPath,
    url
  ]);

  // Wait for the process to finish
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const error = await new Response(proc.stderr).text();
    throw new Error("Download failed: " + error);
  }

  try {
    const tempFile = Bun.file(tempPath);
    await Bun.s3.write(outputPath, tempFile);
  } finally {
    await unlink(tempPath);
  }

  return outputPath;
}

export function getSatisfyingVideoSegment(seed: number, category: string): YtVideoSegment {
  const CLIP_DURATION = 45;
  const filtered = SATISFYING.filter(v => v.category === category);

  if (filtered.length === 0) throw new Error('No satisfying videos for this category');

  // 1. Select the video object using the seed
  const videoIndex = Math.min(Math.floor(seed * filtered.length), filtered.length - 1);
  const video = filtered[videoIndex]!;

  // 2. Calculate a random start time within the video's bounds
  // We use the same seed (or a derived one) to pick the timestamp
  const maxStart = Math.max(0, video.duration - CLIP_DURATION);
  const startSeconds = Math.floor(seed * maxStart);
  const endSeconds = startSeconds + CLIP_DURATION;

  // 3. Helper to format seconds into HH:MM:SS
  const formatTime = (s: number): string => new Date(s * 1000).toISOString().slice(11, 19);

  return {
    videoId: video.videoId,
    start: formatTime(startSeconds),
    end: formatTime(endSeconds)
  };
}

export async function pickAndDownloadSatisfyingVideo(seed: number, folder: string, category = 'general') {
  const segment = getSatisfyingVideoSegment(seed, category);
  return await downloadSatisfyingVideo(segment, folder);
}