const { app } = require('@azure/functions');
const { BlobServiceClient } = require('@azure/storage-blob');
const sql = require('mssql');

app.storageBlob('FinalToSacs', {
    path: 'thumbnails/{name}',
    connection: 'userphototest_STORAGE',
    handler: async (blob, context) => {
        context.log(`Storage blob function processed blob "${context.triggerMetadata.name}" with size ${blob.length} bytes`);

        try {
            const connection_string = process.env['userphototest_STORAGE'];

            // Create a BlobServiceClient using the connection string
            const blobServiceClient = BlobServiceClient.fromConnectionString(connection_string);

            // Get a reference to the 'thumbnails' container
            const containerClient = blobServiceClient.getContainerClient('thumbnails');

            // List all blobs in the container
            let blobs = [];

            for await (const blobItem of containerClient.listBlobsFlat()) {
                const blobClient = containerClient.getBlobClient(blobItem.name);
                const blobProperties = await blobClient.getProperties();
                blobs.push({
                    name: blobItem.name,
                    properties: blobProperties
                });
            }

            context.log({ blobs });

            // Find the latest blob based on lastModified property
            let latestBlobName;
            let latestLastModified = new Date(1900, 0, 1); // A very old date to start with

            for (const blob of blobs) {
                if (blob.properties.lastModified > latestLastModified) {
                    latestLastModified = blob.properties.lastModified;
                    latestBlobName = blob.name;
                }
            }

            context.log(`latest blob is "${latestBlobName}"`)

            sql.on('error', err => {
              // Log any mssql errors
              context.log('MSSQL error:', err);
          });
          

            if (latestBlobName) {
                //download latest blob to buffer and convert to useable format (base64)
                const blobClient = containerClient.getBlobClient(latestBlobName);
                const blobData = await blobClient.downloadToBuffer();
                const base64Data = blobData.toString('base64'); 

                // Create a connection pool to the MS SQL database
                const pool = await sql.connect({
                    server: '155.198.31.163',
                    port: 49549,
                    database: 'TST_010823',
                    user: 'photoapptest',
                    password: '<(vjB)fl(%X@zLLxqi',
                    options: {
                        trustServerCertificate: true  // Add this option within the 'options' object
                    }
                });

                // Prepare the SQL statement to select data from the database
                const sqlStatement = `Insert into PERSONS values (2, 'McGuffin', 'Mike', '124 Fake Street', 'Nowhere')`;
                const request = pool.request();

                // Execute the SQL statement to select data from the database
                const result = await request.query(sqlStatement);

                // Close the connection pool
                await pool.close();

                // Log the results
                context.log(result.recordset);
            } else {
                context.log('No blobs found in the container.');
            }
        } catch (error) {
            context.log(error);
        }
    }
});
