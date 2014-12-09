var getFile = require('./get-file');
var path = require('path');

/*
 * Converts Swagger 1.2 specs file to Swagger 2.0 specs.
 * @param sourceUri {string} - entry point to Swagger 1.2 specs file. This can
 *  be an HTTP URL or a local file path
 * @param callback {function} - A function that will be called with an error and
 *   Swagger 2.0 document JSON object as arguments
*/
module.exports = function convert(sourceUri, callback) {
  getFile(sourceUri, function(error, source) {
    var basePath = path.dirname(sourceUri);
    var result = {
      swagger: '2.0',
      info: buildInfo(source),
    };

    if (error) { return callback(error); }

    buildPaths(source, basePath, function(error, paths) {
      result.paths = paths;
      callback(error, result);
    });
  });
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
}

/*
 * Builds "paths" section of Swagger 2.0 document
 * @param source {object} - Swagger 1.2 document object
 * @param basePath {string} - base path for getting path objects
 * @param callback {function} - A function that will be called with an error and
 *  "paths" section of Swagger 2.0 document as arguments
*/
function buildPaths(source, basePath, callback) {
  var paths = {};
  var index = 0; // Index of last path resolved
  makePath();

  function makePath() {
    var api = source.apis[index];
    var pathName = api.path.substr(1);
    getFile(path.join(basePath, pathName + '.json'), function(err, oldPath) {
      if (err) { return callback(err); }
      paths[api.path] = buildPath(oldPath);

      if (index === (source.apis.length - 1)) {
        callback(null, paths);
      } else {
        index++;
        makePath();
      }
    });
  }
}

/*
 * Builds a Swagger 2.0 path object form a Swagger 1.2 path object
 * @param oldPath {object} - Swagger 1.2 path object
 * @returns {object} - Swagger 2.0 path object
*/
function buildPath(oldPath) {
  var path = {};

  oldPath.apis.forEach(function(pathApi) {
    pathApi.operations.forEach(function(oldOperation) {
      path[oldOperation.method.toLowerCase()] = buildOperation(oldOperation);
    });
  });

  return path;
}

/*
 * Builds a Swagger 2.0 operation object form a Swagger 1.2 operation object
 * @param oldOperation {object} - Swagger 1.2 operation object
 * @returns {object} - Swagger 2.0 operation object
*/
function buildOperation(oldOperation) {
  var operation = {responses: {}};

  oldOperation.responseMessages.forEach(function(oldResponse) {
    operation.responses[oldResponse.code] = responseMessages(oldResponse);
  });

  return operation;
}

/*
 * Builds a Swagger 2.0 response object form a Swagger 1.2 response object
 * @param oldResponse {object} - Swagger 1.2 response object
 * @returns {object} - Swagger 2.0 response object
*/
function responseMessages(oldResponse) {
  var response = {};

  // TODO: Confirm this is correct
  response.description = oldResponse.message;

  return response;
}
