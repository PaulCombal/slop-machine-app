import {reuploadShort} from "../utils/google.mts";

const renderId = process.argv[2];

if (!renderId) {
  console.log(process.argv);
  throw new Error('Missing renderId');
}

console.log('Starting upload..')
const res = await reuploadShort(renderId);
console.log(res);
