import type { JobType } from "bullmq";
import { assetsQueue } from "../../clients/queues.mts";
import { type JobDTO, toJobDTO } from "../dto.ts";

const RECENT_STATES: JobType[] = [
	"active",
	"waiting",
	"delayed",
	"completed",
	"failed",
];

/**
 * View of the assets-pipeline queue. The API only ever *produces* (enqueues a
 * trigger) and *reads* here; the worker remains the sole consumer. Deep job
 * internals stay in bullboard.
 */
export const jobsRepo = {
	/** Kick off a one-off news run (same entry the news scheduler fires). */
	async triggerNews(
		personaGroupName: string,
		carryingPersona: string,
	): Promise<string> {
		const job = await assetsQueue.add("trigger-video-flow", {
			personaGroupName,
			carryingPersona,
		});
		return String(job.id ?? "");
	},

	/** Kick off a one-off show tick (produces the next pending episode). */
	async triggerShow(showId: string): Promise<string> {
		const job = await assetsQueue.add("show-tick", { showId });
		return String(job.id ?? "");
	},

	/** Break the whole prose into an episode manifest, no rendering. */
	async triggerShowBreakdown(showId: string): Promise<string> {
		const job = await assetsQueue.add("show-breakdown", { showId });
		return String(job.id ?? "");
	},

	/** Render one episode now (no upload). */
	async triggerEpisodeRender(
		showId: string,
		episodeIndex: number,
	): Promise<string> {
		const job = await assetsQueue.add("render-episode", {
			showId,
			episodeIndex,
		});
		return String(job.id ?? "");
	},

	/** Publish one already-rendered episode to the show's platforms. */
	async triggerEpisodePublish(
		showId: string,
		episodeIndex: number,
	): Promise<string> {
		const job = await assetsQueue.add("publish-episode", {
			showId,
			episodeIndex,
		});
		return String(job.id ?? "");
	},

	async recent(limit = 25): Promise<JobDTO[]> {
		// Pull a generous slice across states, then sort newest-first ourselves
		// (per-state ordering from getJobs isn't a global chronological order).
		const jobs = await assetsQueue.getJobs(RECENT_STATES, 0, limit * 3, false);
		const dtos = await Promise.all(
			jobs.map(async (j) => toJobDTO(j, await j.getState())),
		);
		return dtos
			.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
			.slice(0, limit);
	},

	async counts(): Promise<Record<string, number>> {
		return assetsQueue.getJobCounts(...RECENT_STATES);
	},
};
