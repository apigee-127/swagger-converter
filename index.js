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
  var info = {
    version: source.apiVersion
  };

  if (typeof source.info === 'object') {

    if (source.info.title) {
      info.title = source.info.title;
    } else {
      info.title = '';
    }

    if (source.info.description) {
      info.description = source.info.description;
    }

    if (source.info.contact) {
      info.contact = {
        email: source.info.contact
      };
    }

    if (source.info.license) {
      info.license = {
        name: source.info.license,
        url: source.info.licenseUrl
      };
    }

    if (source.info.termsOfServiceUrl) {
      info.termsOfService = source.info.termsOfServiceUrl;
    }
  }

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

  // In case "operations" exists (embedded Swagger) use "operations" and don't
  // look for files that include the operation information
  // Note: A document can not have non-emebedded and embedded paths at the same
  // time. If first path has key "operations" as an object, we assume all paths
  // will have "operations"
  if (typeof source.apis[0].operations === 'object') {
    source.apis.forEach(function(api) {
      paths[api.path] = {};
      api.operations.forEach(function(operation) {
        paths[api.path][operation.method.toLowerCase()] =
          buildOperation(operation);
      });
    });
    return callback(null, paths);
  }

  var index = 0; // Index of last path resolved
  makePath();

  /*
   * Asyncronisly makes a path for each `api` and increment `index` until it
   * reaches to end of the `source.api` array
  */
  function makePath() {
    var api = source.apis[index];
    var pathName = api.path.substr(1);
    getFile(path.join(basePath, pathName), function(err, oldPath) {
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
      var method = oldOperation.method.toLowerCase();
      path[method] = buildOperation(oldOperation, oldPath);
    });
  });

  return path;
}

/*
 * Builds a Swagger 2.0 operation object form a Swagger 1.2 operation object
 * @param oldOperation {object} - Swagger 1.2 operation object
 * @param oldPath {object} - Swagger 1.2 path object that contains the operation
 * @returns {object} - Swagger 2.0 operation object
*/
function buildOperation(oldOperation, oldPath) {
  var operation = {
    responses: {},
    description: oldOperation.description || ''
  };

  if (oldOperation.summary) {
    operation.summary = oldOperation.summary;
  }

  if (oldOperation.nickname) {
    operation.operationId = oldOperation.nickname;
  }

  if (oldPath && oldPath.produces) {
    operation.produces = oldPath.produces;
  }

  if (Array.isArray(oldOperation.parameters)) {
    operation.parameters = oldOperation.parameters.map(buildParameter);
  }

  if (Array.isArray(oldOperation.responseMessages)) {
    oldOperation.responseMessages.forEach(function(oldResponse) {
      operation.responses[oldResponse.code] = responseMessages(oldResponse);
    });
  }

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

/*
 * Converts Swagger 1.2 parameter object to Swagger 2.0 parameter object
 * @param oldParameter {object} - Swagger 1.2 parameter object
 * @returns {object} - Swagger 2.0 parameter object
*/
function buildParameter(oldParameter) {
  var parameter = {
    in: oldParameter.paramType,
    description: oldParameter.description,
    name: oldParameter.name,
    required: !!oldParameter.required
  };
  var literalTypes = ['string', 'integer', 'boolean'];
  if (literalTypes.indexOf(oldParameter.type) === -1) {
    parameter.schema = {$ref: '#/definitions/' + oldParameter.type};
  } else {
    parameter.type = oldParameter.type;
  }

  return parameter;
}
