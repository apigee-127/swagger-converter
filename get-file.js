var fs = require('fs');

/*
 * Fetches a remote or local location and returns file contents
 * @param uri {string} - URL to remote resource or file path for local file
 * @param callback {function} - A function that will called with error and the
 *  content of required JSON file arguments
*/
module.exports = function getFile(uri, callback) {
  // FIXME: for now getFile only works in Node.js environment and for local
  // files. getFile should work in browser and also for remote files

  if (typeof callback !== 'function') {
    throw new Error('callback function is required for getFile');
  }

  fs.readFile(uri, function(error, file) {
    var json = null;

    if (error) {
      return callback(error);
    }

    try {
      json = JSON.parse(file.toString());
    } catch (jsonError) {
      return callback(jsonError);
    }

    callback(error, json);

  });
};
