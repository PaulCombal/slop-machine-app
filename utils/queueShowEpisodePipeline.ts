import { flowProducer } from "../clients/queues.mts";
import { createOuptutFolder } from "./utils.mts";
import type { FlowJob } from "bullmq";

type EpisodePipelineOptions = {
	render?: boolean;
	upload?: boolean;
};

/**
 * Build the BullMQ flow for a single episode:
 *   generate-episode-assets -> render-video -> dispatch-uploads
 * It mirrors queueVideoPipeline but with a Show-specific leaf job. The
 * render and upload children are the exact same jobs the news pipeline uses.
 */
export async function queueShowEpisodePipeline(
	showId: string,
	episodeIndex: number,
	options: EpisodePipelineOptions = {},
) {
	// Mint the renderId here, outside the retried job, so every retry of
	// generate-episode-assets reuses the same folder and resumes.
	const { renderId } = await createOuptutFolder();

	const generateAssetsJob: FlowJob = {
		name: "generate-episode-assets",
		queueName: "assets-pipeline",
		data: { showId, episodeIndex, renderId },
		opts: {
			attempts: 10,
			backoff: {
				type: "exponential",
				delay: 1000,
			},
		},
	};

	if (options.render === false) {
		return await flowProducer.add(generateAssetsJob);
	}

	const renderVideoJob: FlowJob = {
		name: "render-video",
		queueName: "render-pipeline",
		children: [generateAssetsJob],
	};

	if (options.upload === false) {
		return await flowProducer.add(renderVideoJob);
	}

	return await flowProducer.add({
		name: "dispatch-uploads",
		queueName: "assets-pipeline",
		children: [renderVideoJob],
	});
}
