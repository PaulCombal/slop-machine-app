export async function cleanS3() {
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const listObjectsResponse = await Bun.s3.list();
  const files = listObjectsResponse.contents;

  if (!files || files.length === 0) {
    console.log("No files found in S3 bucket.");
    return;
  }

  const deletionPromises = files.map(async (file) => {
    const match = file.key.match(/^(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})/);

    if (match) {
      const [_, date, hour, min, sec] = match;
      const fileDate = new Date(`${date}T${hour}:${min}:${sec}Z`);

      if (fileDate < fortyEightHoursAgo) {
        console.log(`Deleting expired render: ${file.key}`);
        return Bun.s3.delete(file.key);
      }
    }
  });

  await Promise.all(deletionPromises);
}