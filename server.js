// Placeholder: root server moved to `backend/server.js` for local development.
// This file was causing Vercel serverless functions to attempt writing to
// the local filesystem (e.g. creating `/var/task/uploads`). That is not
// allowed on Vercel. To avoid accidental execution in the serverless
// runtime, this file is now an inert placeholder.

module.exports = {};
