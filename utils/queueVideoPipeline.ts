import {flowProducer} from "../clients/queues.mts";

export async function queueVideoPipeline(personaGroupName: string, carryingPersona: string, automated: boolean) {
  if (process.env.DEBUG !== 'false' && automated) {
    console.log('Skipped video producing in DEBUG mode')
    return null;
  }

  return await flowProducer.add({
    name: 'upload-to-youtube',
    queueName: 'assets-pipeline',
    children: [
      {
        name: 'render-video',
        queueName: 'render-pipeline',
        children: [
          {
            name: 'generate-assets',
            queueName: 'assets-pipeline',
            data: { personaGroupName, carryingPersona }
          }
        ]
      }
    ]
  });
}