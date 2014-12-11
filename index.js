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
 * Process a data type object.
 *
 * @see {@link https://github.com/swagger-api/swagger-spec/blob/master/versions/
 *  1.2.md#433-data-type-fields}
 *
 * @param field {object} - A data type field
 *
 * @returns {object} - Swagger 2.0 equivalent
 */
function processDataType(field) {
  if (field.$ref) {
    field.$ref = '#/definitions/' + field.$ref;
  } else if (field.items && field.items.$ref) {
    field.items.$ref = '#/definitions/' + field.items.$ref;
  }

  if (field.minimum) {
    field.minimum = parseInt(field.minimum);
  }

  if (field.maximum) {
    field.maximum = parseInt(field.maximum);
  }

  if (field.defaultValue) {
    if (field.type === 'integer') {
      field.default = parseInt(field.defaultValue, 10);
    } else if (field.type === 'number') {
      field.default = parseFloat(field.defaultValue);
    } else {
      field.default = field.defaultValue;
    }

    delete field.defaultValue;
  }

  return field;
}

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
    var convertedSecurityNames = {};
    var models = {};
    var result = {
      swagger: '2.0',
      info: buildInfo(source)
    };

    if (source.authorizations) {
      result.securityDefinitions = buildSecurityDefinitions(source,
        convertedSecurityNames);
    }

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
          buildOperation(processDataType(operation));
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
    operation.parameters = oldOperation.parameters.map(function(parameter) {
      return buildParameter(processDataType(parameter));
    });
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

  ['default', 'maximum', 'minimum', 'items'].forEach(function(name) {
    if (oldParameter[name]) {
      parameter[name] = oldParameter[name];
    }
  });

  return parameter;
}

/*
 * Convertes Swagger 1.2 authorization definitions to Swagger 2.0 security
 *   definitions
 *
 * @param resourceListing {object} - The Swagger 1.2 Resource Listing document
 * @param convertedSecurityNames {object} - A list of original Swagger 1.2
 * authorization names and the new Swagger 2.0
 *  security names associated with it (This is required because Swagger 2.0 only
 *  supports one oauth2 flow per security definition but in Swagger 1.2 you
 *  could describe two (implicit and authorization_code).  To support this, we
 *  will create a per-flow version of each oauth2 definition, where necessary,
 *  and keep track of the new names so that when we handle security references
 *  we reference things properly.)
 *
 * @returns {object} - Swagger 2.0 security definitions
 */
function buildSecurityDefinitions(resourceListing, convertedSecurityNames) {
  var securityDefinitions = {};

  Object.keys(resourceListing.authorizations).forEach(function(name) {
    var authorization = resourceListing.authorizations[name];
    var createDefinition = function createDefinition(oName) {
      var securityDefinition = securityDefinitions[oName || name] = {
        type: authorization.type
      };

      if (authorization.passAs) {
        securityDefinition.in = authorization.passAs;
      }

      if (authorization.keyname) {
        securityDefinition.name = authorization.keyname;
      }

      return securityDefinition;
    };

    // For oauth2 types, 1.2 describes multiple "flows" in one auth and for 2.0,
    // that is not an option so we need to
    // create one security definition per flow and keep track of this mapping.
    if (authorization.grantTypes) {
      convertedSecurityNames[name] = [];

      Object.keys(authorization.grantTypes).forEach(function(gtName) {
        var grantType = authorization.grantTypes[gtName];
        var oName = name + '_' + gtName;
        var securityDefinition = createDefinition(oName);

        convertedSecurityNames[name].push(oName);

        if (gtName === 'implicit') {
          securityDefinition.flow = 'implicit';
        } else {
          securityDefinition.flow = 'accessCode';
        }

        switch (gtName) {
        case 'implicit':
          securityDefinition.authorizationUrl = grantType.loginEndpoint.url;
          break;

        case 'authorization_code':
          securityDefinition.authorizationUrl =
            grantType.tokenRequestEndpoint.url;
          securityDefinition.tokenUrl = grantType.tokenEndpoint.url;
          break;
        }

        if (authorization.scopes) {
          securityDefinition.scopes = {};

          authorization.scopes.forEach(function(scope) {
            securityDefinition.scopes[scope.scope] = scope.definition ||
              ('Undescribed ' + scope.scope);
          });
        }
      });
    } else {
      createDefinition();
    }
  });

  return securityDefinitions;
}

/*
 * Transforms a Swagger 1.2 model object to a Swagger 2.0 model object
 * @param model {object} - (mutable) Swagger 1.2 model object
*/
function transformModel(model) {
  if (typeof model.properties === 'object') {
    Object.keys(model.properties).forEach(function(propertieName) {
      model.properties[propertieName] =
        processDataType(model.properties[propertieName]);
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

  var hierarchy = {};

  Object.keys(models).forEach(function(modelId) {
    var model = models[modelId];

    transformModel(model);

    if (model.subTypes) {
      hierarchy[modelId] = model.subTypes;

      delete model.subTypes;
    }
  });

  Object.keys(hierarchy).forEach(function(parent) {
    hierarchy[parent].forEach(function(childId) {
      var childModel = models[childId];

      if (childModel) {
        childModel.allOf = (childModel.allOf || []).concat({
          $ref: '#/definitions/' + parent
        });
      }
    });
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
