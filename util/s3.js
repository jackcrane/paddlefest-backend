import aws from "aws-sdk";
import "dotenv/config";
import { unlinkSync, statSync, writeFileSync } from "fs";
import { v4 } from "uuid";
import imagemin from "imagemin";
import imageminJpegRecompress from "imagemin-jpeg-recompress";
import imageminPngquant from "imagemin-pngquant";

const space = new aws.Endpoint(process.env.DO_SPACES_ENDPOINT);
const s3 = new aws.S3({
  endpoint: space,
  accessKeyId: process.env.DO_SPACES_KEY,
  secretAccessKey: process.env.DO_SPACES_SECRET,
});

const g = async (image) => {
  const file = image;
  try {
    const uuid = v4();
    writeFileSync(`./${uuid}-unoptimized.jpg`, file);
    const optimized = await imagemin([`./${uuid}-unoptimized.jpg`], {
      plugins: [
        imageminJpegRecompress(),
        imageminPngquant({
          quality: [0.6, 0.8],
        }),
      ],
    });
    writeFileSync(`./${uuid}-optimized.jpg`, optimized[0].data);
    const buf = optimized[0].data;
    let _old = statSync(`./${uuid}-unoptimized.jpg`).size / (1024 * 1024);
    let _new = statSync(`./${uuid}-optimized.jpg`).size / (1024 * 1024);
    console.log(`Compressed ${_old} to ${_new}`);
    unlinkSync(`./${uuid}-unoptimized.jpg`);
    unlinkSync(`./${uuid}-optimized.jpg`);

    let p1 = await s3
      .putObject({
        Bucket: process.env.DO_SPACES_NAME,
        Key: `paddlefest/upload-${uuid}.jpeg`,
        Body: buf,
        ACL: "public-read",
        ContentType: "image/jpeg",
      })
      .promise();

    return {
      url: `https://${process.env.DO_SPACES_NAME}.${process.env.DO_SPACES_ENDPOINT}/paddlefest/upload-${uuid}.jpeg`,
      uuid,
    };
  } catch (error) {
    console.log(error);
  }
};

export { g as UploadToS3 };
