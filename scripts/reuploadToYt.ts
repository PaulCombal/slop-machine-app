import {reuploadShort} from "../utils/google.mts";

const renderId = process.argv[2];
if (!renderId) {
  console.log(process.argv);
  throw new Error('Missing renderId');
}

const channelId = process.argv[3];
if (!channelId) {
  console.log(process.argv);
  throw new Error('Missing channelId');
}

console.log('Starting upload..')

try {
  const res = await reuploadShort(renderId, channelId);
  console.log(res);
}
catch (e) {
  console.error('Error reuploading video')
  console.error(e)
  console.trace(e)
  process.exit(1)
}
