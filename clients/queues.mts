import { Queue, QueueEvents } from "bullmq";

const connectionConfig = {
	host: "valkey",
	port: 6379,
};

export const videoQueue = new Queue("video-rendering", {
	connection: connectionConfig,
});

export const remotionRenderQueueEvents = new QueueEvents("video-rendering", {
	connection: connectionConfig,
});
