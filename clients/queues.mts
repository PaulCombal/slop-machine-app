import {FlowProducer, Queue, QueueEvents} from "bullmq";

const connectionConfig = {
	host: process.env.QUEUE_HOST || "valkey",
	port: 6379,
};

export const videoQueue = new Queue("render-service-queue", {
	connection: connectionConfig,
});

export const remotionRenderQueueEvents = new QueueEvents("render-service-queue", {
	connection: connectionConfig,
});

export const flowProducer = new FlowProducer({
	connection: connectionConfig,
});