import {queueVideoPipeline} from "./utils/queueVideoPipeline.ts";

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

await queueVideoPipeline(personaGroupName, carryingPersona, false);