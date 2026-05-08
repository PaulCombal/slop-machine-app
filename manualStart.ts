import { queueVideoPipeline } from "./utils/queueVideoPipeline.ts";

// 1. Separate flags from positional arguments
const args = process.argv.slice(2);
const positionalArgs = args.filter(arg => !arg.startsWith('--'));

// 2. Assign positionals based on the filtered list
const personaGroupName = positionalArgs[0] || process.env.DEFAULT_PERSONA_GROUP;
const carryingPersona = positionalArgs[1] || process.env.DEFAULT_CARRYING_PERSONA;

if (!personaGroupName) throw new Error('Missing personaGroupName');
if (!carryingPersona) throw new Error('Missing carryingPersona');

// 3. Check for flags specifically within the original args list
const render = !args.includes('--render=false');
const upload = !args.includes('--upload=false');

const options = {
  automated: false,
  render,
  upload
};

console.log(`Group: ${personaGroupName}, Persona: ${carryingPersona}`);
console.log(`Options:`, options);

await queueVideoPipeline(personaGroupName, carryingPersona, options);