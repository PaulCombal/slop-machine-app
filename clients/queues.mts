import {Queue} from "bullmq";

export const videoQueue = new Queue('video-rendering', {
  connection: {
    host: 'valkey',
    port: 6379
  }
});