import {flowProducer} from "./clients/queues.mts";

const personaGroupName = process.argv[2] || process.env.DEFAULT_PERSONA_GROUP;
if (!personaGroupName) {
  console.log(process.argv);
  throw new Error('Missing personaGroupName');
}

const carryingPersona = process.argv[3] || process.env.DEFAULT_CARRYING_PERSONA;
if (!carryingPersona) {
  console.log(process.argv);
  throw new Error('Missing carryingPersona');
}

async function queueVideoGeneration(personaGroupName: string, carryingPersona: string) {
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

const jobNode = await queueVideoGeneration(personaGroupName, carryingPersona);