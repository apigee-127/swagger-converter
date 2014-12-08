var getFile = require('./get-file');

/*
 * Converts Swagger 1.2 specs file to Swagger 2.0 specs.
 * @param sourceUri {string} - entry point to Swagger 1.2 specs file. This can
 *  be an HTTP URL or a local file path
 * @returns {object} - Swagger 2.0 document JSON object
*/
module.exports = function convert(sourceUri) {
  var source = getFile(sourceUri);
  var dest = {
    swagger: '2.0',
    info: buildInfo(source),
    paths: {}
  };

  return dest;
};

/*
 * Builds "info" section of Swagger 2.0 document
 * @param source {object} - Swagger 1.2 document object
 * @returns {object} - "info" section of Swagger 2.0 document
*/
function buildInfo(source) {
  var info = source.info;
  info.version = source.apiVersion;
  return info;
};
