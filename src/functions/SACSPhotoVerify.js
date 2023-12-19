const dotenv = require("dotenv").config();
const { app } = require("@azure/functions");
const { BlobServiceClient } = require("@azure/storage-blob");
const { v4: uuidv4 } = require("uuid");
const sharp = require("sharp");
const fetch = require("node-fetch");
const msal = require("@azure/msal-node");
const { rejectEmail } = require("./rejectEmail");
const { noFaceEmail } = require("./noFaceEmail");
const ComputerVisionClient =
  require("@azure/cognitiveservices-computervision").ComputerVisionClient;
const ApiKeyCredentials = require("@azure/ms-rest-js").ApiKeyCredentials;
const async = require("async");
const { multiFaceEmail } = require("./multiFaceEmail");

module.exports = app.storageBlob("SACSPhotoVerify", {
  path: "images/{name}",
  connection: "userphototest_STORAGE",
  handler: async (myBlob, context) => {
    //////////////////////CONNECT TO STORAGE ACCOUNT AND CONTAINER/////////////////////////////////
    // Create connection string to storageaccount from address in local.settings.json
    const connection_string = process.env["userphototest_STORAGE"];
    context.log(
      `Storage blob function processed blob "${context.triggerMetadata.name}" with size ${myBlob.length} bytes, url:${context.triggerMetadata.uri}`
    );

    // Create a BlobServiceClient using the connection string
    const blobServiceClient =
      BlobServiceClient.fromConnectionString(connection_string);
    context.log(`Create a BlobServiceClient using the connection string`);

    // Get a reference to the source container (images)
    const sourceContainerName = "images";
    const sourceContainerClient =
      blobServiceClient.getContainerClient(sourceContainerName);

    // Get a reference to the destination container (thumbnails)
    const destinationContainerName = "thumbnails";
    const destinationContainerClient = blobServiceClient.getContainerClient(
      destinationContainerName
    );

    // Access the blob name from the trigger metadata
    const blobName = context.triggerMetadata.name;
    context.log("This is the blob name:", blobName);

    // Access the blob url from the trigger metadata
    const blobUrl = context.triggerMetadata.uri;

    //set bloburl
    const imageUrl = blobUrl;
    context.log("This is the ImageURL:", imageUrl);

    //////////////////////FINISH CONNECT TO STORAGE ACCOUNT AND CONTAINER/////////////////////////////////

    // Create ComputerVision Client and authenticate
    const key = process.env.VISION_KEY;
    const endpoint = process.env.VISION_ENDPOINT;

    const computerVisionClient = new ComputerVisionClient(
      new ApiKeyCredentials({ inHeader: { "Ocp-Apim-Subscription-Key": key } }),
      endpoint
    );

    // Get the visual feature for analysis
    const features = ["Color"];

    //initialise users email address
    const emailAddress = "leo.palmer@imperial.ac.uk"; //This is to become a variable passed in with the email address of the student

    const describeURL = imageUrl;
    context.log("This is the describeURL:", describeURL);

    /////////////////////PHOTO VERIFICATION//////////////////////////////////////
    //////////////Can this be called as a seperate component to tidy it up?////////////////////////

    //Use ComputerVision/AnalyzeImage to check whether the image is B&W. Result passed to photoVerify function.
    async function analyzeImage(describeURL) {
      try {
        // Analyze the image using the Computer Vision service
        const result = await computerVisionClient.analyzeImage(describeURL, {
          visualFeatures: features,
        });

        // Detect Colors
        const color = result.color;
        const colorTest = result.color.isBwImg;

        // Log the color information
        console.log("color", color);
        console.log("COLOR TEST", colorTest);

        return colorTest;
      } catch (error) {
        console.log(`COLOR ERROR: ${error}`);
        throw error;
      }
    }
    const BwImg = await analyzeImage(describeURL);

    //set up keys, endpoints etc for face api
    const faceKey = process.env.FACE_KEY;
    const faceEndpoint = process.env.FACE_ENDPOINT;
    const faceApiUrl = `${faceEndpoint}/face/v1.0/detect`;
    const headers = {
      "Ocp-Apim-Subscription-Key": faceKey,
      "Content-Type": "application/json",
    };

    //photoVerify function using Face API to do checks
    async function photoVerify(imageUrl, BwImg) {
      const BlackWhite = BwImg;
      console.log("BLACKWHITE", BlackWhite);

      //define parameters for http request to Face API
      const params = new URLSearchParams({
        // "returnFaceId": "false",
        returnFaceLandmarks: "false",
        returnFaceAttributes: "accessories,glasses,exposure, blur, headPose",
      });

      //pick the latest photo based on image url from earlier
      const data = { url: imageUrl };
      console.log("DATA", data);

      //post the photo data to the face api with params and retrieve the results
      const response = await fetch(`${faceApiUrl}?${params}`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(data),
      });

      const faces = await response.json();
      console.log({ faces });
      //console.log("RECTANGLE", faces.faceRectangle);

      //initialise resultDict object to carry check results
      let resultDict = {};

      //check to see if there are any faces in photo. If not, send an email saying so, otherwise continue with checks.
      if (!faces.length) {
        noFaceEmail(emailAddress);
        return;
      } else if (faces.length > 1) {
        multiFaceEmail(emailAddress);
        return;
      } else {
        //set threshold for degrees to check if they are facing forwards
        const yawThreshold = 10;

        //run series of checks using face api and add bool value to resultDict
        faces.forEach((face) => {
          const rectangle = face.faceRectangle;
          console.log("RECTANGLE", rectangle);
          const accessories = face.faceAttributes.accessories;
          const faceAttributes = face.faceAttributes;
          const headPose = faceAttributes.headPose;
          const yawAngle = headPose.yaw;
          console.log(`YAW VALUE: ${yawAngle}`);
          const glassesAttribute = faceAttributes.glasses;
          console.log(`What type of glasses?.. ${glassesAttribute}`);
          const headwear = accessories.some((item) => item.type === "headWear");
          const mask = accessories.some((item) => item.type === "mask");
          const notFacingCamera = function () {
            if (Math.abs(yawAngle) <= yawThreshold) {
              return false;
            } else {
              return true;
            } //add in default value/error handling to prevent crashes
          };
          const facingCameraRes = notFacingCamera();
          const isWearingSunglasses = function () {
            if (glassesAttribute === "Sunglasses") {
              return true;
            } else {
              return false;
            }
          };
          const sunglassRes = isWearingSunglasses();

          console.log("Face ID:", face.faceId);
          console.log("Is Wearing Sunglasses:", sunglassRes);
          console.log("Is Wearing Mask:", mask);
          console.log("Is Wearing Headwear:", headwear);
          console.log("Is not Facing camera?:", notFacingCamera());
          console.log("Is the image black and white?:", BlackWhite);

          resultDict[face.faceID] = {
            Sunglasses: sunglassRes,
            HeadWear: headwear,
            Mask: mask,
            NotFacingTheCamera: facingCameraRes,
            BwImg: BlackWhite,
          };
        });
      }

      console.log("result dict", resultDict);

      return resultDict;
    }

    // console.log("IMAGE URL AFTER FUNC", imageUrl);
    let resultDict = await photoVerify(imageUrl, BwImg);

    // Check if all items in the resultDict object are false
    if (resultDict) {
      const validCriteria = Object.values(resultDict).every(
        (attributes) =>
          !attributes.Sunglasses &&
          !attributes.Mask &&
          !attributes.HeadWear &&
          !attributes.NotFacingTheCamera &&
          !BwImg
      );

      console.log("Valid criteria:", validCriteria);

      /////////////////////PHOTO VERIFICATION END//////////////////////////////////////

      //if the photo has no issues then resize and send to 'thumbnails' container. If it fails then send an email to user explaining why.
      if (validCriteria) {
        async function produceThumbnail() {
          try {
            // Get a reference to the source blob
            const sourceBlobClient =
              sourceContainerClient.getBlobClient(blobName);

            // Download the original blob content
            const blobData = await sourceBlobClient.downloadToBuffer();

            // Perform image resizing using 'sharp'
            const resizedImageBuffer = await sharp(blobData)
              .resize({ width: 200, height: 200 }) // Specify the desired thumbnail size here
              .toBuffer();

            // Create a new blob URL with the generated name in the destination container
            const destinationBlobClient =
              destinationContainerClient.getBlockBlobClient(blobName);

            // Upload the resized image to the destination container
            await destinationBlobClient.uploadData(resizedImageBuffer, {
              blobHTTPHeaders: { blobContentType: "image/jpeg" },
            });

            context.log(
              `Resized image uploaded to "${destinationContainerName}".`
            );
          } catch (error) {
            context.log(
              `An error occurred while processing the blob. Error: ${error}`
            );
            context.log(
              `An error occurred while moving the blob. Error: ${error.message}`
            );
            context.log(`Error code: ${error.code}`);
            context.log(`Error details: ${JSON.stringify(error.details)}`);
            context.log(`Error stack trace: ${error.stack}`);
          }
        }
        produceThumbnail();
      } else {
        rejectEmail(resultDict, emailAddress).catch((error) => {
          console.log(error);
        });
      }
    }
  },
});
