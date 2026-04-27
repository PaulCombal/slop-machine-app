import {FlowProducer, Queue, QueueEvents} from "bullmq";

const connectionConfig = {
	host: process.env.QUEUE_HOST || "valkey",
	port: 6379,
};

export const assetsQueue = new Queue("assets-pipeline", {
	connection: connectionConfig,
});

export const renderQueue = new Queue("render-pipeline", {
	connection: connectionConfig,
});

export const remotionRenderQueueEvents = new QueueEvents("render-pipeline", {
	connection: connectionConfig,
});

export const flowProducer = new FlowProducer({
	connection: connectionConfig,
});