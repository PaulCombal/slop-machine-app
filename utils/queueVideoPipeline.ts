import {flowProducer} from "../clients/queues.mts";
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

  const generateAssetsJob: FlowJob = {
    name: 'generate-assets',
    queueName: 'assets-pipeline',
    data: { personaGroupName, carryingPersona },
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
    name: 'upload-to-youtube',
    queueName: 'assets-pipeline',
    children: [renderVideoJob]
  });
}
