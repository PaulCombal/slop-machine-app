import {ensureDevelopmentAssets} from "../utils/utils.mts";

const filename = process.argv[2];
const destination = process.argv[3];

if (!filename || !destination) {
	console.log(process.argv);
	throw new Error('Missing filename or destination');
}

await ensureDevelopmentAssets();

console.log('Starting upload..')
await Bun.s3.write(destination, Bun.file(filename))
