import { unlink } from "node:fs/promises";

export type SatisfyingVideoCategory = 'satisfying' | 'gameplay' | 'america';

export type SatisfyingVideoData = {
	source: 's3' | 'yt';
	category: SatisfyingVideoCategory;
	videoId: string;
	duration: number; // In seconds
};

export type VideoSegment = {
	video: SatisfyingVideoData;
	startSeconds: number;
	endSeconds: number;
	start: string;
	end: string;
};

const SATISFYING: SatisfyingVideoData[] = [
	{
		source: 'yt',
		category: "satisfying",
		videoId: "c0TODv-6G_A", // https://www.youtube.com/watch?v=c0TODv-6G_A
		duration: 60 * 60,
	},
	{
		source: 's3',
		category: "gameplay",
		videoId: "surfer",
		duration: 60 * 3,
	},
	{
		source: 's3',
		category: "gameplay",
		videoId: "Minecraft",
		duration: 60 * 15,
	},
	{
		source: 's3',
		category: "america",
		videoId: "usflag",
		duration: 110,
	},
];

async function downloadSatisfyingVideo(
	segment: VideoSegment,
	folder: string,
) {
	switch (segment.video.source) {
		case 's3':
			return await downloadS3SatisfyingVideo(segment, folder);
		case "yt":
			return await downloadYtSatisfyingVideo(segment, folder);
		default:
			throw new Error('Unknwown video source: ' + segment.video.source);
	}
}

async function downloadYtSatisfyingVideo(
	segment: VideoSegment,
	folder: string,
) {
	const url = `https://www.youtube.com/watch?v=${segment.video.videoId}`;
	const outputPath = `${folder}/satisfying.webm`;

	if (process.env.DEBUG !== "false") {
		const sourceFile = Bun.file(`/assets/debug/satisfying.webm`);
		await Bun.s3.write(outputPath, sourceFile);
		return outputPath;
	}

	const tempPath = `/tmp/video-${Date.now()}.webm`;
	const proc = Bun.spawn([
		"yt-dlp",
		"--js-runtimes",
		"bun",
		"--download-sections",
		`*${segment.start}-${segment.end}`,
		"--downloader", "ffmpeg",
		"--downloader-args", "ffmpeg:-c:v libvpx-vp9 -c:a libopus",
		"-o",
		tempPath,
		url,
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

async function downloadS3SatisfyingVideo(
	segment: VideoSegment,
	folder: string,
) {
	const s3File = Bun.s3.file(`assets/satisfying/${segment.video.videoId}.mp4`);
	const outputPath = `${folder}/satisfying.webm`;
	const tempPath = `/tmp/video-${Date.now()}.webm`;

	if (process.env.DEBUG !== "false") {
		const sourceFile = Bun.file(`/assets/debug/satisfying.webm`);
		await Bun.s3.write(outputPath, sourceFile);
		return outputPath;
	}

	console.log(`Checking S3 file: assets/satisfying/${segment.video.videoId}.mp4`);
	console.log(`S3 File Size: ${s3File.size} bytes`);
	if (s3File.size === 0) throw new Error("S3 file is empty or missing.");

	const proc = Bun.spawn([
		"ffmpeg",
		"-ss", `${segment.startSeconds}`,     // Fast seek (before input)
		"-i", "pipe:0",                      // Read from stdin
		"-to", `${segment.endSeconds - segment.startSeconds}`, // Duration
		"-c:v", "libvpx-vp9",                // WebM Video codec
		"-crf", "30",                        // Quality (lower is better, 15-35 range)
		"-b:v", "0",                         // Required for constant quality mode
		"-c:a", "libopus",                   // WebM Audio codec
		"-y",                                // Overwrite output
		tempPath,
	], {
		stdin: s3File.stream(),        // Stream S3 file directly into FFmpeg
	});

	const exitCode = await proc.exited;

	if (exitCode !== 0) {
		const error = await new Response(proc.stderr).text();
		throw new Error(`FFmpeg cut failed: ${error}`);
	}

	try {
		const tempFile = Bun.file(tempPath);
		await Bun.s3.write(outputPath, tempFile);
	} finally {
		await unlink(tempPath);
	}

	return outputPath;
}

export function getSatisfyingVideoSegment(
	seed: number,
	category: SatisfyingVideoCategory,
): VideoSegment {
	const CLIP_DURATION = 45;
	const filtered = SATISFYING.filter((v) => v.category === category);

	if (filtered.length === 0)
		throw new Error("No satisfying videos for this category");

	// 1. Select the video object using the seed
	const videoIndex = Math.min(
		Math.floor(seed * filtered.length),
		filtered.length - 1,
	);
	const video = filtered[videoIndex]!;

	// 2. Calculate a random start time within the video's bounds
	// We use the same seed (or a derived one) to pick the timestamp
	const maxStart = Math.max(0, video.duration - CLIP_DURATION);
	const startSeconds = Math.floor(seed * maxStart);
	const endSeconds = startSeconds + CLIP_DURATION;

	// 3. Helper to format seconds into HH:MM:SS
	const formatTime = (s: number): string =>
		new Date(s * 1000).toISOString().slice(11, 19);

	return {
		video: video,
		startSeconds,
		endSeconds,
		start: formatTime(startSeconds),
		end: formatTime(endSeconds),
	};
}

export async function pickAndDownloadSatisfyingVideo(
	seed: number,
	folder: string,
	category: SatisfyingVideoCategory = "satisfying",
) {
	const segment = getSatisfyingVideoSegment(seed, category);
	return await downloadSatisfyingVideo(segment, folder);
}
