// Vercel serverless entrypoint for the Eshrahli Express API.
// The Express app handles /api/* routes and is reused across warm invocations.
module.exports = require("../server");
