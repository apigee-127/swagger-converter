var getFile = require('./get-file');
var path = require('path');

/*
 * Converts Swagger 1.2 specs file to Swagger 2.0 specs.
 * @param sourceUri {string} - entry point to Swagger 1.2 specs file. This can
 *  be an HTTP URL or a local file path
 * @returns {object} - Swagger 2.0 document JSON object
*/
module.exports = function convert(sourceUri) {
  var basePath = path.dirname(sourceUri);
  var source = getFile(sourceUri);
  var dest = {
    swagger: '2.0',
    info: buildInfo(source),
    paths: buildPaths(source, basePath)
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
}

/*
 * Builds "paths" section of Swagger 2.0 document
 * @param source {object} - Swagger 1.2 document object
 * @param basePath {string} - base path for getting path objects
 * @returns {object} - "paths" section of Swagger 2.0 document
*/
function buildPaths(source, basePath) {
  var paths = {};

  source.apis.forEach(function(api) {
    var pathName = api.path.substr(1);
    var oldPath = getFile(path.join(basePath, pathName + '.json'));

    paths[api.path] = buildPath(oldPath);
  });

  return paths;
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
