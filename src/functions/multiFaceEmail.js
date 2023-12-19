const { Client } = require("@microsoft/microsoft-graph-client");
const { ConfidentialClientApplication } = require("@azure/msal-node");

async function multiFaceEmail(emailAddress) {
  // console.log`resultDict passed to rejectEmail ${(resultDict)}`

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
      content: `Hello ${emailAddress}, \n \n Your photo has been rejected as there were multiple faces detected in the image. Please resolve this issue before re-submitting \n If you have any further questions please contact id.card@imperial.ac.uk`,
    },
  };

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

multiFaceEmail();

module.exports = {
  multiFaceEmail: multiFaceEmail,
};
