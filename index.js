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

var assert = require('assert');
var urlParse = require('url').parse;
var clone = require('lodash.clonedeep');

if (typeof window === 'undefined') {
  module.exports = convert;
} else {
  window.SwaggerConverter = window.SwaggerConverter || {
    convert: convert
  };
}

/*
 * Converts Swagger 1.2 specs file to Swagger 2.0 specs.
 * @param resourceListing {object} - root Swagger 1.2 document where it has a
 *  list of all paths
 * @param apiDeclarations {array} - a list of all resources listed in
 * resourceListing. Array of objects
 * @returns {object} - Fully converted Swagger 2.0 document
*/
function convert(resourceListing, apiDeclarations) {
  assert(typeof resourceListing === 'object');
  if (!Array.isArray(apiDeclarations)) {
    apiDeclarations = [];
  }

  var convertedSecurityNames = {};
  var models = {};
  var result = {
    swagger: '2.0',
    info: buildInfo(resourceListing),
    paths: {}
  };

  if (resourceListing.authorizations) {
    result.securityDefinitions = buildSecurityDefinitions(resourceListing,
      convertedSecurityNames);
  }

  extend(result, buildPathComponents(resourceListing.basePath));

  extend(models, resourceListing.models);

  // Handle embedded documents
  if (Array.isArray(resourceListing.apis)) {
    if (apiDeclarations.length > 0) {
      result.tags = [];
    }
    resourceListing.apis.forEach(function(api) {
      if (result.tags) {
        result.tags.push({
          'name': api.path.replace('.{format}', '').substring(1),
          'description': api.description || 'No description was specified'
        });
      }
      if (Array.isArray(api.operations)) {
        result.paths[api.path] = buildPath(api, resourceListing);
      }
    });
  }

  apiDeclarations.forEach(function(apiDeclaration) {

    // For each apiDeclaration if there is a basePath, assign path components
    // This might override previous assignments
    extend(result, buildPathComponents(apiDeclaration.basePath));

    if (!Array.isArray(apiDeclaration.apis)) { return; }
    apiDeclaration.apis.forEach(function(api) {
      result.paths[api.path] = buildPath(api, apiDeclaration);

    });
    if (apiDeclaration.models && Object.keys(apiDeclaration.models).length) {
      extend(models, transformAllModels(apiDeclaration.models));
    }
  });

  if (Object.keys(models).length) {
    result.definitions = transformAllModels(models);
  }

  return result;
}

/*
 * Builds "info" section of Swagger 2.0 document
 * @param source {object} - Swagger 1.2 document object
 * @returns {object} - "info" section of Swagger 2.0 document
*/
function buildInfo(source) {
  var info = {
    version: source.apiVersion || '1.0.0',
    title: 'Title was not specified'
  };

  if (typeof source.info === 'object') {

    if (source.info.title) {
      info.title = source.info.title;
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
 * Get host, basePath and schemes for Swagger 2.0 result document from
 * Swagger 1.2 basePath.
 * @param basePath {string} - the base path from Swagger 1.2
*/
function buildPathComponents(basePath) {
  if (!basePath) { return {}; }

  var url = urlParse(basePath);
  return {
    host: url.host,
    basePath: url.path || '/',
    //url.protocol include traling colon
    schemes: url.protocol && [url.protocol.slice(0, -1)]
  };
}

/*
 * Builds a Swagger 2.0 type properites from a Swagger 1.2 type properties
 *
 * @param oldDataType {object} - Swagger 1.2 type object
 *
 * @returns {object} - Swagger 2.0 equivalent
 */
function buildTypeProperties(oldType) {
  if (!oldType) { return {}; }

  //TODO: handle list[<TYPE>] types from 1.1 spec

  var typeMap = {
    integer:  {type: 'integer'},
    number:   {type: 'number'},
    string:   {type: 'string'},
    boolean:  {type: 'boolean'},
    array:    {type: 'array'},
    file:     {type: 'file'},
    int:      {type: 'integer', format: 'int32'},
    long:     {type: 'integer', format: 'int64'},
    float:    {type: 'number',  format: 'float'},
    double:   {type: 'double',  format: 'double'},
    byte:     {type: 'string',  format: 'byte'},
    date:     {type: 'string',  format: 'date'},
    datetime: {type: 'string',  format: 'date-time'},
    list:     {type: 'array'},
    void:     {}
  };

  return typeMap[oldType.toLowerCase()] || {$ref: oldType};
}

/*
 * Builds a Swagger 2.0 data type properites from a Swagger 1.2 data type properties
 *
 * @see {@link https://github.com/swagger-api/swagger-spec/blob/master/versions/
 *  1.2.md#433-data-type-fields}
 *
 * @param oldDataType {object} - Swagger 1.2 data type object
 *
 * @returns {object} - Swagger 2.0 equivalent
 */
function buildDataType(oldDataType) {
  if (!oldDataType) { return; }
  assert(typeof oldDataType === 'object');

  var result = buildTypeProperties(
    oldDataType.type || oldDataType.dataType || oldDataType.responseClass
  );

  //TODO: handle '0' in default
  var defaultValue = oldDataType.default || oldDataType.defaultValue;
  if (result.type !== 'string') {
    defaultValue = fixNonStringValue(defaultValue);
  }

  //TODO: support 'allowableValues' from 1.1 spec

  var items;
  if (result.type === 'array') {
    items = buildDataType(oldDataType.items) || {type: 'object'};
  }

  extend(result, {
    format: oldDataType.format,
    items: items,
    uniqueItems: fixNonStringValue(oldDataType.uniqueItems),
    minimum: fixNonStringValue(oldDataType.minimum),
    maximum: fixNonStringValue(oldDataType.maximum),
    default: defaultValue,
    enum: oldDataType.enum,
    $ref: oldDataType.$ref,
  });

  // Checking for the existence of '#/definitions/' is related to this bug:
  //   https://github.com/apigee-127/swagger-converter/issues/6
  if (isValue(result.$ref) && result.$ref.indexOf('#/definitions/') === -1) {
    //TODO: better resolution based on 'id' field.
    result.$ref = '#/definitions/' + result.$ref;
  }

  return (Object.keys(result).length !== 0) ? result : undefined;
}

/*
 * Builds a Swagger 2.0 path object form a Swagger 1.2 path object
 * @param api {object} - Swagger 1.2 path object
 * @param apiDeclaration {object} - parent apiDeclaration
 * @returns {object} - Swagger 2.0 path object
*/
function buildPath(api, apiDeclaration) {
  var path = {};

  api.operations.forEach(function(oldOperation) {
    var method = oldOperation.method.toLowerCase();
    path[method] = buildOperation(oldOperation, apiDeclaration.produces,
      apiDeclaration.consumes, apiDeclaration.resourcePath);
  });

  return path;
}

/*
 * Builds a Swagger 2.0 operation object form a Swagger 1.2 operation object
 * @param oldOperation {object} - Swagger 1.2 operation object
 * @param produces {array} - from containing apiDeclaration
 * @param consumes {array} - from containing apiDeclaration
 * @returns {object} - Swagger 2.0 operation object
*/
function buildOperation(oldOperation, produces, consumes, resourcePath) {
  var operation = {
    responses: {},
    description: oldOperation.description || ''
  };

  if (resourcePath) {
    operation.tags = [];
    operation.tags.push(resourcePath.substr(1));
  }

  if (oldOperation.summary) {
    operation.summary = oldOperation.summary;
  }

  if (oldOperation.nickname) {
    operation.operationId = oldOperation.nickname;
  }

  if (produces) {
    operation.produces = produces;
  }

  if (Array.isArray(oldOperation.produces)) {
    operation.produces = oldOperation.produces;
  }

  if (consumes) {
    operation.consumes = consumes;
  }

  if (Array.isArray(oldOperation.consumes)) {
    operation.consumes = oldOperation.consumes;
  }

  if (Array.isArray(oldOperation.parameters) &&
      oldOperation.parameters.length) {
    operation.parameters = oldOperation.parameters.map(function(parameter) {
      return buildParameter(parameter);
    });
  }

  if (Array.isArray(oldOperation.responseMessages)) {
    oldOperation.responseMessages.forEach(function(oldResponse) {
      operation.responses[oldResponse.code] = buildResponse(oldResponse);
    });
  }

  var schema = buildDataType(oldOperation);

  if (!Object.keys(operation.responses).length ||
      !isValue(operation.responses['200'])) {
    operation.responses['200'] = {
      description: 'No response was specified'
    };
  }

  if (isValue(schema)) {
    operation.responses['200'].schema = schema;
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
  var parameter = extend({}, {
    in: oldParameter.paramType,
    description: oldParameter.description,
    name: oldParameter.name,
    required: fixNonStringValue(oldParameter.required)
  });

  // form was changed to formData in Swagger 2.0
  if (parameter.in === 'form') {
    parameter.in = 'formData';
  }

  var schema = buildDataType(oldParameter);
  var allowMultiple = fixNonStringValue(oldParameter.allowMultiple);
  if (allowMultiple === true) {
    extend(parameter, {
      type: 'array',
      items: schema
    });
  } else if (oldParameter.paramType === 'body') {
    parameter.schema = schema;
  } else {
    extend(parameter, schema);
  }

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
            securityDefinition.scopes[scope.scope] = scope.description ||
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
      var oldPropertie = model.properties[propertieName];
      model.properties[propertieName] = extend(
        buildDataType(oldPropertie),
        {description: oldPropertie.description}
      );
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
  var modelsClone = clone(models);

  if (typeof models !== 'object') {
    throw new Error('models must be object');
  }

  var hierarchy = {};

  Object.keys(modelsClone).forEach(function(modelId) {
    var model = modelsClone[modelId];
    delete model['id'];

    transformModel(model);

    if (model.subTypes) {
      hierarchy[modelId] = model.subTypes;

      delete model.subTypes;
    }
  });

  Object.keys(hierarchy).forEach(function(parent) {
    hierarchy[parent].forEach(function(childId) {
      var childModel = modelsClone[childId];

      if (childModel) {
        var allOf = (childModel.allOf || []).concat({
          $ref: '#/definitions/' + parent
        }).concat(clone(childModel));
        for (var member in childModel) {
          delete childModel[member];
        }
        childModel.allOf = allOf;
      }
    });
  });

  return modelsClone;
}

/*
 * Extends an object with another
 * @param destination {object} - object that will get extended
 * @parma source {object} - object the will used to extend source
*/
function extend(destination, source) {
  assert(typeof destination === 'object');
  if (!source) { return; }

  Object.keys(source).forEach(function(key) {
    var value = source[key];
    if (isValue(value)) {
      destination[key] = value;
    }
  });
  return destination;
}

/*
 * Test if value isn't null or undefined
 * @param value {*} - value to test
 * @returns {boolean} - result of test
*/
function isValue(value) {
  return (value !== undefined && value !== null);
}

/*
 * Convert string values into the proper type.
 * @param value {*} - value to convert
 * @returns {*} - transformed modles object
*/
function fixNonStringValue(value) {
  if (typeof value !== 'string') {
    return value;
  }

  if (value === '') {
    return undefined;
  }

  var lcValue = value.toLowerCase();

  if (lcValue === 'true') {
    return true;
  }
  if (lcValue === 'false') {
    return false;
  }

  try {
    return JSON.parse(value);
  } catch (e) {
    throw Error('incorect property value: ' + e.message);
  }
}
