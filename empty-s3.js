import aws from "aws-sdk";
import "dotenv/config";

const space = new aws.Endpoint(process.env.DO_SPACES_ENDPOINT);
const s3 = new aws.S3({
  endpoint: space,
  accessKeyId: process.env.DO_SPACES_KEY,
  secretAccessKey: process.env.DO_SPACES_SECRET,
});

var params = { Bucket: process.env.DO_SPACES_NAME, Key: "your object" };

s3.listObjects(
  {
    Bucket: process.env.DO_SPACES_NAME,
    Prefix: "apple-music-rich-presence/",
  },
  function (err, data) {
    data.Contents.forEach(async (k) => {
      s3.deleteObject(
        {
          Bucket: process.env.DO_SPACES_NAME,
          Key: k.Key,
        },
        function (err, data) {
          if (err) console.log(err, err.stack); // error
          else console.log("Deleted"); // deleted
        }
      );
    });
    console.log(data.Contents.length);
  }
);
