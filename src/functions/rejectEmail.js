const { Client } = require("@microsoft/microsoft-graph-client");
const { ConfidentialClientApplication } = require("@azure/msal-node");

async function rejectEmail(resultDict, emailAddress) {
  console.log("resultDict passed to rejectEmail", resultDict);

  const msalConfig = {
    auth: {
      clientId: "598663e4-40ed-4470-a369-485ba04e379d",
      authority:
        "https://login.microsoftonline.com/2b897507-ee8c-4575-830b-4f8267c3d307",
      clientSecret: "1rA8Q~ZaCTl_76RLqqOYZWZkLWN5WFj7pgziidjf",
    },
  };

  const cca = new ConfidentialClientApplication(msalConfig);

  const tokenRequest = {
    scopes: ["https://graph.microsoft.com/.default"],
  };

  async function acquireAccessToken() {
    try {
      const tokenResponse = await cca.acquireTokenByClientCredential(
        tokenRequest
      );
      console.log(tokenResponse.accessToken);
      return tokenResponse.accessToken;
    } catch (error) {
      console.error("Error acquiring token:", error);
      throw error;
    }
  }

  // Define the email message
  const email = {
    subject: "ID Photo Submission",
    toRecipients: [{ emailAddress: { address: emailAddress } }],
    body: {
      contentType: "Text",
      content: `Hello ${emailAddress}, \n \n`,
    },
  };

  //check resultDict keys for truthy values, match those keys to a message and then add that message to the email
  const attributeToMessage = {
    Mask: "You appear to be wearing a mask",
    Sunglasses: "You appear to be wearing Sunglasses",
    NotFacingTheCamera: "You are not directly facing the camera",
    NoFaces: "There are no faces detected in the image",
    BwImg: "The image is in black and white. Please make sure it's in colour.",
  };

  const rejectionReasons = [];

  try {
    for (const faceId in resultDict) {
      const attributes = resultDict[faceId];
      for (const key in attributes) {
        if (attributes[key]) {
          const message = attributeToMessage[key];
          if (message) {
            rejectionReasons.push(message);
          }
        }
      }
    }
  } catch (error) {
    console.log(error);
  }

  console.log(rejectionReasons);

  if (rejectionReasons.length > 0) {
    const rejectionText = rejectionReasons
      .map((reason) => `- ${reason}`)
      .join("\n");
    email.body.content += `Your photo has been rejected for the reasons listed below, please resolve them before re-submitting. \n \n${rejectionText} \n \n If you have any further questions please contact id.card@imperial.ac.uk`;
  } else if ((rejectionReasons.length = 0)) {
    email.body.content += `Your photo has been rejected for the reasons listed below, please resolve them before re-submitting. \n \n No face detected`;
  }

  async function sendEmail() {
    // Call acquireAccessToken to obtain the access token
    const accessToken = await acquireAccessToken();

    // Create a custom authentication provider
    const customAuthProvider = {
      getAccessToken: async () => {
        return accessToken;
      },
    };

    // Initialize the Graph client with the custom authentication provider
    const client = Client.initWithMiddleware({
      authProvider: customAuthProvider,
    });

    // Send the email
    try {
      const emailResponse = await client
        .api("/users/leo.palmer@imperial.ac.uk/sendMail") //REPLACE WITH SERVICE ACCOUNT
        .post({
          message: email,
          saveToSentItems: true,
        });

      console.log("Email sent:", emailResponse);
    } catch (error) {
      console.error("Error sending email:", error);
    }
  }

  // Call the sendEmail function to send the email
  sendEmail().catch((error) => {
    console.error("Error:", error);
  });
}

rejectEmail();

module.exports = {
  rejectEmail: rejectEmail,
};
