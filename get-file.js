var fs = require('fs');

/*
 * Fetches a remote or local location and returns file contents
 * @param uri {string} - URL to remote resource or file path for local file
 * @returns {string} - content of required file
*/
module.exports = function getFile(uri) {
  // FIXME: for now getFile only works in Node.js environment and for local
  // files. getFile should work in browser and also for remote files

  return JSON.parse(fs.readFileSync(uri).toString());
};
