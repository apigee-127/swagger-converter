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
  var definitions = {};
  var result = {
    swagger: '2.0',
    info: buildInfo(resourceListing),
    paths: {}
  };

  if (resourceListing.authorizations) {
    result.securityDefinitions = buildSecurityDefinitions(resourceListing,
      convertedSecurityNames);
  }

  var tagDescriptions = {};
  resourceListing.apis.forEach(function(resource) {
    var tagName = extractTag(resource.path);
    if (!isValue(tagName)) { return; }

    tagDescriptions[tagName] = resource.description;
  });

  // Handle embedded documents
  var resources = [resourceListing].concat(apiDeclarations);

  resources.forEach(function(resource) {
    var operationTags;
    var tagName = extractTag(resource.resourcePath);

    if (isValue(tagName)) {
      result.tags = result.tags || [];
      result.tags.push(extend({}, {
        name: tagName,
        description: tagDescriptions[tagName]
      }));
      operationTags = [tagName];
    }

    extend(definitions, buildDefinitions(resource.models));
    extend(result.paths, buildPaths(resource, operationTags));

    // For each apiDeclaration if there is a basePath, assign path components
    // This might override previous assignments
    extend(result, buildPathComponents(resource.basePath));
  });

  if (Object.keys(definitions).length) {
    result.definitions = definitions;
  }
  return result;
}

/*
 * Extract name of the tag from resourcePath
 * @param resourcePath {string} - Swagger 1.2 resource path
 * @returns {string} - tag name
*/
function extractTag(resourcePath) {
  if (!isValue(resourcePath)) { return; }

  var path = urlParse(resourcePath).path;
  if (!isValue(path)) { return; }

  path = path.replace(/\/$/, '');
  path = path.replace('{format}', 'json');
  path = path.replace(/.json$/, '');
  path = path.split(['/']).pop();

  if (path === '') { return; }
  return path;
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
    defaultValue = fixNonStringValue(defaultValue, true);
  }

  //TODO: support 'allowableValues' from 1.1 spec

  var items;
  if (result.type === 'array') {
    var oldItems = oldDataType.items;
    if (!isValue(oldItems)) {
      items = {type: 'object'};
    }
    else {
      if (typeof oldItems === 'string') {
        oldItems = {type: oldItems};
      }
      items = buildDataType(oldItems);
    }
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
 * Builds a Swagger 2.0 paths object form a Swagger 1.2 path object
 * @param apiDeclaration {object} - Swagger 1.2 apiDeclaration
 * @param tag {array} - array of Swagger 2.0 tag names
 * @returns {object} - Swagger 2.0 path object
*/
function buildPaths(apiDeclaration, tags) {
  var paths = {};

  var operationProperties = {
    produces: apiDeclaration.produces,
    consumes: apiDeclaration.consumes,
    tags: tags
  };

  apiDeclaration.apis.forEach(function(api) {
    if (!isValue(api.operations)) { return; }

    var pathString = api.path.replace('{format}', 'json');
    var path = paths[pathString] = {};

    api.operations.forEach(function(oldOperation) {
      var method = oldOperation.method || oldOperation.httpMethod;
      method = method.toLowerCase();
      path[method] = buildOperation(oldOperation, operationProperties);
    });
  });

  return paths;
}

/*
 * Builds a Swagger 2.0 operation object form a Swagger 1.2 operation object
 * @param oldOperation {object} - Swagger 1.2 operation object
 * @param declarationDefaults {object} - defaults from containing apiDeclaration
 * @returns {object} - Swagger 2.0 operation object
*/
function buildOperation(oldOperation, declarationDefaults) {
  var oldParameters = oldOperation.parameters;
  var parameters;

  if (Array.isArray(oldParameters) && oldParameters.length) {
    parameters = oldParameters.map(buildParameter);
  }

  //TODO: process Swagger 1.2 'authorizations'
  return extend({}, declarationDefaults, {
    operationId: oldOperation.nickname,
    summary: oldOperation.summary,
    description: oldOperation.description || oldOperation.notes,
    deprecated: fixNonStringValue(oldOperation.deprecated),
    produces: oldOperation.produces,
    consumes: oldOperation.consumes,
    parameters: parameters,
    responses: buildResponses(oldOperation)
  });
}

/*
 * Builds a Swagger 2.0 responses object form a Swagger 1.2 responseMessages object
 * @param oldOperation {object} - Swagger 1.2 operation object
 * @returns {object} - Swagger 2.0 response object
*/
function buildResponses(oldOperation) {
  var oldResponses = oldOperation.responseMessages;
  var responses = {
    '200': {description: 'No response was specified'}
  };

  if (Array.isArray(oldResponses)) {
    oldResponses.forEach(function(oldResponse) {
      //TODO: process Swagger 1.2 'responseModel'
      responses['' + oldResponse.code] = extend({}, {
        description: oldResponse.message,
      });
    });
  }

  extend(responses['200'], {
    schema: buildDataType(oldOperation)
  });

  return responses;
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
 * Convertes a Swagger 1.2 model object to a Swagger 2.0 model object
 * @param model {object} - Swagger 1.2 model object
 * @returns {object} - Swagger 2.0 model object
*/
function buildModel(oldModel) {
  if (typeof oldModel !== 'object') {
    throw new Error('model must be object');
  }

  var required = [];
  var properties = {};
  var oldProperties = oldModel.properties;

  if (isValue(oldProperties)) {
    Object.keys(oldProperties).forEach(function(propertyName) {
      var oldProperty = oldProperties[propertyName];

      if (fixNonStringValue(oldProperty.required) === true) {
        required.push(propertyName);
      }

      properties[propertyName] = extend({},
        buildDataType(oldProperty),
        {description: oldProperty.description}
      );
    });
  }

  required = oldModel.required || required;
  if (required.length === 0) {
    required = undefined;
  }

  return extend({}, {
    description: oldModel.description,
    required: required,
    properties: properties,
    discriminator: oldModel.discriminator
  });
}

/*
 * Convertes the "models" object of Swagger 1.2 specs to Swagger 2.0 definitions
 * object
 * @param oldModels {object} - an object containing Swagger 1.2 objects
 * @returns {object} - Swagger 2.0 definitions object
*/
function buildDefinitions(oldModels) {
  if (!isValue(oldModels)) { return {}; }

  if (typeof oldModels !== 'object') {
    throw new Error('models must be object');
  }

  var models = {};

  Object.keys(oldModels).forEach(function(modelId) {
    models[modelId] = buildModel(oldModels[modelId]);
  });

  Object.keys(oldModels).forEach(function(parentId) {
    var subTypes = oldModels[parentId].subTypes;

    if (!isValue(subTypes)) { return; }

    subTypes.forEach(function(childId) {
      var child = models[childId];

      if (!isValue(child)) {
        throw new Error('');
      }

      if (!isValue(child.allOf)) {
        models[childId] = child = {allOf: [child]};
      }

      child.allOf.push({$ref: '#/definitions/' + parentId});
    });
  });

  return models;
}

/*
 * Extends an object with another
 * @param destination {object} - object that will get extended
 * @parma source {object} - object the will used to extend source
*/
function extend(destination) {
  assert(typeof destination === 'object');

  function assign(source) {
    if (!source) { return; }
    Object.keys(source).forEach(function(key) {
      var value = source[key];
      if (isValue(value)) {
        destination[key] = value;
      }
    });
  }

  for (var i = 1; i < arguments.length; ++i) {
    assign(arguments[i]);
  }
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
 * @param skipError {boolean} - skip error during conversion
 * @returns {*} - transformed modles object
*/
function fixNonStringValue(value, skipError) {
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
    //TODO: report warning
    if (skipError === true) {
      return undefined;
    }

    throw Error('incorect property value: ' + e.message);
  }
}
