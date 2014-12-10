/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2014 Apigee Corporation
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

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
    var models = {};
    var result = {
      swagger: '2.0',
      info: buildInfo(source)
    };

    if (source.basePath) {
      result.basePath = source.basePath;
    }

    extend(models, source.models);

    if (error) { return callback(error); }

    buildPathsAndModels(source, basePath, function(error, paths, pathsModels) {
      result.paths = paths;
      extend(models, pathsModels);
      if (Object.keys(models).length) {
        result.definitions = transformAllModels(models);
      }
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
 * Builds "paths" and "models" sections of Swagger 2.0 document
 * @param source {object} - Swagger 1.2 document object
 * @param basePath {string} - base path for getting path objects
 * @param callback {function} - A function that will be called with an error,
 *  "paths" and "models" section of Swagger 2.0 document as arguments
*/
function buildPathsAndModels(source, basePath, callback) {
  var paths = {};
  var models = {};

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

      // Extend models with models in this path
      extend(models, api.models);
    });
    return callback(null, paths, models);
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

      // Extend models with models in this path
      extend(models, oldPath.models);

      if (index === (source.apis.length - 1)) {
        callback(null, paths, models);
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
  if (oldPath && oldPath.consumes) {
    operation.consumes = oldPath.consumes;
  }

  if (Array.isArray(oldOperation.parameters) &&
      oldOperation.parameters.length) {
    operation.parameters = oldOperation.parameters.map(buildParameter);
  }

  if (Array.isArray(oldOperation.responseMessages)) {
    oldOperation.responseMessages.forEach(function(oldResponse) {
      operation.responses[oldResponse.code] = buildResponse(oldResponse);
    });
  }

  if (!Object.keys(operation.responses).length) {
    operation.responses = {
      '200': {
        description: 'No response was specified'
      }
    };
  }

  return operation;
}

/*
 * Builds a Swagger 2.0 response object form a Swagger 1.2 response object
 * @param oldResponse {object} - Swagger 1.2 response object
 * @returns {object} - Swagger 2.0 response object
*/
function buildResponse(oldResponse) {
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
  var typeLowerCase = oldParameter.type.toLowerCase();
  var parameter = {
    in: oldParameter.paramType,
    description: oldParameter.description,
    name: oldParameter.name,
    required: !!oldParameter.required
  };
  var literalTypes = ['string', 'integer', 'boolean', 'file'];
  if (literalTypes.indexOf(typeLowerCase) === -1) {
    parameter.schema = {$ref: '#/definitions/' + oldParameter.type};
  } else {
    parameter.type = typeLowerCase;
  }

  // form was changed to formData in Swagger 2.0
  if (parameter.in === 'form') {
    parameter.in = 'formData';
  }

  return parameter;
}

/*
 * Transforms a Swagger 1.2 model object to a Swagger 2.0 model object
 * @param model {object} - (mutable) Swagger 1.2 model object
*/
function transformModel(model) {
  if (typeof model.properties === 'object') {
    Object.keys(model.properties).forEach(function(propertieName) {
      var property = model.properties[propertieName];

      if (property.type === 'integer') {
        if (property.minimum) {
          property.minimum = parseInt(property.minimum);
        }
        if (property.maximum) {
          property.maximum = parseInt(property.maximum);
        }
      }

      model.properties[propertieName] = property;
    });
  }
}

/*
 * Transfers the "models" object of Swagger 1.2 specs to Swagger 2.0 definitions
 * object
 * @param models {object} - (mutable) an object containing Swagger 1.2 objects
 * @returns {object} - transformed modles object
*/
function transformAllModels(models) {
  if (typeof models !== 'object') {
    throw new Error('models must be object');
  }

  Object.keys(models).forEach(function(modleName) {
    transformModel(models[modleName]);
  });

  return models;
}

/*
 * Extends an object with another
 * @param source {object} - object that will get extended
 * @parma distention {object} - object the will used to extend source
*/
function extend(source, distention) {
  if (typeof source !== 'object') {
    throw new Error('source must be objects');
  }

  if (typeof distention === 'object') {
    Object.keys(distention).forEach(function(key) {
      source[key] = distention[key];
    });
  }
}
