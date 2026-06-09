import {flowProducer} from "../clients/queues.mts";
import {createOuptutFolder} from "./utils.mts";
import type {FlowJob} from "bullmq";

type VideoPipelineQueuingOption = {
  automated: boolean,
  render?: boolean,
  upload?: boolean
}

export async function queueVideoPipeline(personaGroupName: string, carryingPersona: string, options: VideoPipelineQueuingOption) {
  if (process.env.DEBUG !== 'false' && options.automated) {
    console.log('Skipped video producing in DEBUG mode')
    return null;
  }

  // Mint the renderId here, outside the retried job, so every retry of
  // generate-assets reuses the same folder and resumes instead of restarting.
  const {renderId} = await createOuptutFolder();

  const generateAssetsJob: FlowJob = {
    name: 'generate-assets',
    queueName: 'assets-pipeline',
    data: { personaGroupName, carryingPersona, renderId },
    opts: {
      attempts: 10,
      backoff: {
        type: 'exponential',
        delay: 1000
      }
    }
  };

  if (options.render === false) {
    return await flowProducer.add(generateAssetsJob);
  }

  const renderVideoJob: FlowJob = {
    name: 'render-video',
    queueName: 'render-pipeline',
    children: [generateAssetsJob]
  };

  if (options.upload === false) {
    return await flowProducer.add(renderVideoJob);
  }

  return await flowProducer.add({
    name: 'dispatch-uploads',
    queueName: 'assets-pipeline',
    children: [renderVideoJob]
  });
}
