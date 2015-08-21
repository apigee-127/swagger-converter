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
'use strict';

var assert = require('assert');
var urlParse = require('url').parse;

if (typeof window === 'undefined') {
  module.exports = convert;
} else {
  window.SwaggerConverter = window.SwaggerConverter || {
    convert: convert
  };
}

/**
 * Swagger Converter Error
 * @param {string} message - error message
 */
function SwaggerConverterError(message) {
  this.message = message;
  this.stack = Error().stack;
}
SwaggerConverterError.prototype = Object.create(Error.prototype);
SwaggerConverterError.prototype.name = 'SwaggerConverterError';

/*
 * Converts Swagger 1.2 specs file to Swagger 2.0 specs.
 * @param resourceListing {object} - root Swagger 1.2 document where it has a
 *  list of all paths
 * @param apiDeclarations {array} - a list of all resources listed in
 * resourceListing. Array of objects
 * @returns {object} - Fully converted Swagger 2.0 document
*/
function convert(resourceListing, apiDeclarations) {
  var converter = new Converter();
  return converter.convert(resourceListing, apiDeclarations);
}

var Converter = function() {};
var prototype = Converter.prototype;

/*
 * Converts Swagger 1.2 specs file to Swagger 2.0 specs.
 * @param resourceListing {object} - root of Swagger 1.2 document
 * @param apiDeclarations {array} - a list of resources
 * @returns {object} - Fully converted Swagger 2.0 document
*/
prototype.convert = function(resourceListing, apiDeclarations) {
  assert(typeof resourceListing === 'object');

  var securityDefinitions =
    this.buildSecurityDefinitions(resourceListing.authorizations);

  var tags = [];
  this.paths = {};
  this.definitions = {};

  if (this.isEmbeddedDocument(resourceListing)) {
    this.convertApiDeclaration(resourceListing, undefined);
  }
  else {
    tags = this.buildTags(resourceListing, apiDeclarations);

    this.forEach(apiDeclarations, function(declaration, index) {
      var operationTags;

      var tag = tags[index];
      if (isValue(tag)) {
        operationTags = [tag.name];
      }

      this.convertApiDeclaration(declaration, operationTags);
    });
  }

  return extend({},
    this.aggregatePathComponents(resourceListing, apiDeclarations),
    {
      swagger: '2.0',
      info: this.buildInfo(resourceListing),
      tags: undefinedIfEmpty(removeNonValues(tags)),
      paths: undefinedIfEmpty(this.paths),
      securityDefinitions: undefinedIfEmpty(securityDefinitions),
      definitions: undefinedIfEmpty(this.definitions)
    }
  );
};

/*
 * Builds "tags" section of Swagger 2.0 document
 * @param resourceListing {object} - root of Swagger 1.2 document
 * @param apiDeclarations {array} - a list of resources
 * @returns {array} - list of Swagger 2.0 tags
*/
Converter.prototype.buildTags = function(resourceListing, apiDeclarations) {
  if (isEmpty(apiDeclarations)) {
    return [];
  }

  var paths = [];
  this.forEach(apiDeclarations, function(declaration) {
    var path = declaration.resourcePath;
    if (isValue(path) && paths.indexOf(path) === -1) {
      paths.push(path);
    }
  });

  //'resourcePath' is optional parameter and also frequently have invalid values
  //if so than we don't create any tags at all.
  //TODO: generate replacement based on longest common prefix for paths in resource.
  if (paths.length < apiDeclarations.length) {
    return [];
  }

  //TODO: better way to mach tag names and descriptions
  var tagDescriptions = {};
  this.forEach(resourceListing.apis, function(resource) {
    var tagName = this.extractTag(resource.path);
    if (!isValue(tagName)) { return; }

    tagDescriptions[tagName] = resource.description;
  });

  var tags = [];
  this.forEach(paths, function(path) {
    var name = this.extractTag(path);
    var description = tagDescriptions[name];

    tags.push(extend({}, {
      name: name,
      description: description
    }));
  });

  return tags;
};

/*
 * Extract name of the tag from resourcePath
 * @param resourcePath {string} - Swagger 1.2 resource path
 * @returns {string} - tag name
*/
prototype.extractTag = function(resourcePath) {
  if (!isValue(resourcePath)) { return; }

  var path = urlParse(resourcePath).path;
  if (!isValue(path)) { return; }

  path = path.replace(/\/$/, '');
  path = path.replace('{format}', 'json');
  path = path.replace(/.json$/, '');
  path = path.split(['/']).pop();

  if (path === '') { return; }
  return path;
};

/*
 * Converts Swagger 1.2 API declaration
 * @param apiDeclaration {object} - Swagger 1.2 apiDeclaration
 * @param tags {array} - array of Swagger 2.0 tag names
*/
prototype.convertApiDeclaration = function(apiDeclaration, tags) {
  this.customTypes = [];
  if (isValue(apiDeclaration.models)) {
    this.customTypes = Object.keys(apiDeclaration.models);
  }

  extend(this.definitions, this.buildDefinitions(apiDeclaration.models));
  extend(this.paths, this.buildPaths(apiDeclaration, tags));
};

/*
 * Test if object is embedded document
 * @param resourceListing {object} - root of Swagger 1.2 document
 * @returns {boolean} - result of test
*/
prototype.isEmbeddedDocument = function(resourceListing) {
  var seenOperations = false;
  var seenApiDeclaration = false;

  this.forEach(resourceListing.apis, function(resource) {
    if (!isEmpty(resource.operations)) {
      seenOperations = true;
    }
    else if (isValue(resource.path)) {
      seenApiDeclaration = true;
    }

    if (seenOperations && seenApiDeclaration) {
      throw new SwaggerConverterError(
        'Resource listing can not have both operations and API declarations.');
    }
  });

  return seenOperations;
};

/*
 * Builds "info" section of Swagger 2.0 document
 * @param resourceListing {object} - root of Swagger 1.2 document
 * @returns {object} - "info" section of Swagger 2.0 document
*/
prototype.buildInfo = function(resourceListing) {
  var info = {
    title: 'Title was not specified',
    version: resourceListing.apiVersion || '1.0.0',
  };

  var oldInfo = resourceListing.info;
  if (!isValue(oldInfo)) {
    return info;
  }

  var contact = extend({}, {email: oldInfo.contact});
  var license;

  if (isValue(oldInfo.license)) {
    license = extend({}, {
      name: oldInfo.license,
      url: oldInfo.licenseUrl
    });
  }

  return extend(info, {
    title: oldInfo.title,
    description: oldInfo.description,
    contact: undefinedIfEmpty(contact),
    license: undefinedIfEmpty(license),
    termsOfService: oldInfo.termsOfServiceUrl
  });
};

/*
 * Merge path components from all resources.
 * @param resourceListing {object} - root of Swagger 1.2 document
 * @param apiDeclarations {array} - a list of resources
 * @returns {object} - Swagger 2.0 path components
 * @throws {SwaggerConverterError}
*/
prototype.aggregatePathComponents = function(resourceListing, apiDeclarations) {
  var path = extend({}, this.buildPathComponents(resourceListing.basePath));

  var basePath;
  this.forEach(apiDeclarations, function(api) {
    //TODO: Swagger 1.2 support per resouce 'basePath', but Swagger 2.0 doesn't
    // solution could be to create separate spec per each 'basePath'.
    if (isValue(basePath) && api.basePath !== basePath) {
      throw new SwaggerConverterError(
        'Resources can not override each other basePaths');
    }
    basePath = api.basePath;
  });

  return extend(path, this.buildPathComponents(basePath));
};

/*
 * Get host, basePath and schemes for Swagger 2.0 result document from
 * Swagger 1.2 basePath.
 * @param basePath {string} - the base path from Swagger 1.2
 * @returns {object} - Swagger 2.0 path components
*/
prototype.buildPathComponents = function(basePath) {
  if (!basePath) { return {}; }

  var url = urlParse(basePath);
  return {
    host: url.host,
    basePath: absolutePath(url.path) || '/',
    //url.protocol include traling colon
    schemes: url.protocol && [url.protocol.slice(0, -1)]
  };
};

/*
 * Builds a Swagger 2.0 type properites from a Swagger 1.2 type properties
 *
 * @param oldDataType {object} - Swagger 1.2 type object
 *
 * @returns {object} - Swagger 2.0 equivalent
 * @throws {SwaggerConverterError}
 */
prototype.buildTypeProperties = function(oldType) {
  if (!oldType) { return {}; }

  if (this.customTypes.indexOf(oldType) !== -1) {
    return {$ref: oldType};
  }

  var typeMap = {
    integer:  {type: 'integer'},
    number:   {type: 'number'},
    string:   {type: 'string'},
    boolean:  {type: 'boolean'},
    array:    {type: 'array'},
    object:   {type: 'object'},
    file:     {type: 'file'},
    int:      {type: 'integer', format: 'int32'},
    long:     {type: 'integer', format: 'int64'},
    float:    {type: 'number',  format: 'float'},
    double:   {type: 'number',  format: 'double'},
    byte:     {type: 'string',  format: 'byte'},
    date:     {type: 'string',  format: 'date'},
    datetime: {type: 'string',  format: 'date-time'},
    list:     {type: 'array'},
    set:      {type: 'array', uniqueItems: true},
    void:     {},
    any:      {}
  };

  var type = typeMap[oldType.toLowerCase()];
  if (isValue(type)) {
    return type;
  }

  throw new SwaggerConverterError('Incorrect type value: ' + oldType);
};

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
prototype.buildDataType = function(oldDataType) {
  if (!oldDataType) { return {}; }
  assert(typeof oldDataType === 'object');

  var oldType =
    oldDataType.type || oldDataType.dataType || oldDataType.responseClass;
  var oldItems = oldDataType.items;

  if (isValue(oldType)) {
    //handle "<TYPE>[<ITEMS>]" types from 1.1 spec
    //use RegEx with capture groups to get <TYPE> and <ITEMS> values.
    var match = oldType.match(/^(.*)\[(.*)\]$/);
    if (isValue(match)) {
      oldType = match[1];
      oldItems = {type: match[2]};
    }
  }

  var result = this.buildTypeProperties(oldType);

  if (typeof oldItems === 'string') {
    oldItems = {type: oldItems};
  }

  var items;
  if (result.type === 'array') {
    items = this.buildDataType(oldItems);
  }

  //TODO: handle '0' in default
  var defaultValue = oldDataType.default || oldDataType.defaultValue;
  if (result.type !== 'string') {
    defaultValue = fixNonStringValue(defaultValue, true);
  }

  //TODO: support 'allowableValues' from 1.1 spec

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

  if (isValue(result.$ref)) {
    //TODO: better resolution based on 'id' field.
    result.$ref = '#/definitions/' + result.$ref;
  }

  return result;
};

/*
 * Builds a Swagger 2.0 paths object form a Swagger 1.2 path object
 * @param apiDeclaration {object} - Swagger 1.2 apiDeclaration
 * @param tag {array} - array of Swagger 2.0 tag names
 * @returns {object} - Swagger 2.0 path object
*/
prototype.buildPaths = function(apiDeclaration, tags) {
  var paths = {};

  var operationDefaults = {
    produces: apiDeclaration.produces,
    consumes: apiDeclaration.consumes,
    tags: tags
  };

  this.forEach(apiDeclaration.apis, function(api) {
    if (!isValue(api.operations)) { return; }

    var pathString = absolutePath(api.path).replace('{format}', 'json');
    var path = paths[pathString] = {};

    this.forEach(api.operations, function(oldOperation) {
      var method = oldOperation.method || oldOperation.httpMethod;
      method = method.toLowerCase();
      path[method] = this.buildOperation(oldOperation, operationDefaults);
    });
  });

  return paths;
};

/*
 * Builds a Swagger 2.0 operation object form a Swagger 1.2 operation object
 * @param oldOperation {object} - Swagger 1.2 operation object
 * @param operationDefaults {object} - defaults from containing apiDeclaration
 * @returns {object} - Swagger 2.0 operation object
*/
prototype.buildOperation = function(oldOperation, operationDefaults) {
  var parameters = [];

  this.forEach(oldOperation.parameters, function(oldParameter) {
    parameters.push(this.buildParameter(oldParameter));
  });

  //TODO: process Swagger 1.2 'authorizations'
  return extend({}, operationDefaults, {
    operationId: oldOperation.nickname,
    summary: oldOperation.summary,
    description: oldOperation.description || oldOperation.notes,
    deprecated: fixNonStringValue(oldOperation.deprecated),
    produces: oldOperation.produces,
    consumes: oldOperation.consumes,
    parameters: undefinedIfEmpty(parameters),
    responses: this.buildResponses(oldOperation)
  });
};

/*
 * Builds a Swagger 2.0 responses object form a Swagger 1.2 responseMessages object
 * @param oldOperation {object} - Swagger 1.2 operation object
 * @returns {object} - Swagger 2.0 response object
*/
prototype.buildResponses = function(oldOperation) {
  var responses = {
    '200': {description: 'No response was specified'}
  };

  this.forEach(oldOperation.responseMessages, function(oldResponse) {
    var code = '' + oldResponse.code;
    //TODO: process Swagger 1.2 'responseModel'
    responses[code] = extend({}, {
      description: oldResponse.message || 'Description was not specified',
    });
  });

  extend(responses['200'], {
    schema: undefinedIfEmpty(this.buildDataType(oldOperation))
  });

  return responses;
};

/*
 * Converts Swagger 1.2 parameter object to Swagger 2.0 parameter object
 * @param oldParameter {object} - Swagger 1.2 parameter object
 * @returns {object} - Swagger 2.0 parameter object
 * @throws {SwaggerConverterError}
*/
prototype.buildParameter = function(oldParameter) {
  var parameter = extend({}, {
    in: oldParameter.paramType,
    description: oldParameter.description,
    name: oldParameter.name,
    required: fixNonStringValue(oldParameter.required)
  });

  if (parameter.in === 'form') {
    parameter.in = 'formData';
  }

  var schema = this.buildDataType(oldParameter);
  if (oldParameter.paramType === 'body') {
    parameter.schema = schema;
    return parameter;
  }

  //Encoding of non-body arguments is the same not matter which type is specified.
  //So type only affects parameter validation, so it "safe" to add missing types.
  if (!isValue(schema.type)) {
    schema.type = 'string';
  }

  if (schema.type === 'array' && !isValue(schema.items.type)) {
    schema.items.type = 'string';
  }

  var allowMultiple = fixNonStringValue(oldParameter.allowMultiple);
  //Non-body parameters doesn't support array inside array. But in some specs
  //both 'allowMultiple' is true and 'type' is array, so just ignore it.
  if (allowMultiple === true && schema.type !== 'array') {
    schema = {type: 'array', items: schema};
  }

  if (isValue(schema.$ref) ||
    (isValue(schema.items) && isValue(schema.items.$ref)))
  {
    throw new SwaggerConverterError(
      'Complex type is used inside non-body argument.');
  }

  //According to Swagger 2.0 spec: If the parameter is in "path",
  //this property is required and its value MUST be true.
  if (parameter.in === 'path') {
    schema.required = true;
  }

  return extend(parameter, schema);
};

/*
 * Convertes Swagger 1.2 authorization definitions into Swagger 2.0 definitions
 * Definitions couldn't be converted 1 to 1, 'this.securityNamesMap' should be
 * used to map between Swagger 1.2 names and one or more Swagger 2.0 names.
 *
 * @param oldAuthorizations {object} - The Swagger 1.2 Authorizations definitions
 * @returns {object} - Swagger 2.0 security definitions
 */
prototype.buildSecurityDefinitions = function(oldAuthorizations) {
  var securityDefinitions = {};

  this.securityNamesMap = {};
  this.forEach(oldAuthorizations, function(oldAuthorization, name) {
    var scopes = {};
    this.forEach(oldAuthorization.scopes, function(oldScope) {
      var name = oldScope.scope;
      scopes[name] = oldScope.description || ('Undescribed ' + name);
    });

    var securityDefinition = extend({}, {
      type: oldAuthorization.type,
      in: oldAuthorization.passAs,
      name: oldAuthorization.keyname,
      scopes: undefinedIfEmpty(scopes)
    });

    if (securityDefinition.type === 'basicAuth') {
      securityDefinition.type = 'basic';
    }

    if (!isValue(oldAuthorization.grantTypes)) {
      securityDefinitions[name] = securityDefinition;
      this.securityNamesMap[name] = [name];
      return;
    }

    this.securityNamesMap[name] = [];
    // For oauth2 types, 1.2 describes multiple "flows" in one authorization object.
    // But for 2.0 we need to create one security definition per flow.
    this.forEach(oldAuthorization.grantTypes, function(oldGrantType, gtName) {
      var grantParameters = {};

      switch (gtName) {
      case 'implicit':
        extend(grantParameters, {
          flow: 'implicit',
          authorizationUrl: getValue(oldGrantType, 'loginEndpoint', 'url')
        });
        break;

      case 'authorization_code':
        extend(grantParameters, {
          flow: 'accessCode',
          tokenUrl: getValue(oldGrantType, 'tokenEndpoint', 'url'),
          authorizationUrl:
            getValue(oldGrantType, 'tokenRequestEndpoint', 'url')
        });
        break;
      }

      var oName = name;
      if (getLength(oldAuthorization.grantTypes) > 1) {
        oName += '_' + grantParameters.flow;
      }

      this.securityNamesMap[name].push(oName);
      securityDefinitions[oName] =
        extend({}, securityDefinition, grantParameters);
    });
  });

  return securityDefinitions;
};

/*
 * Convertes a Swagger 1.2 model object to a Swagger 2.0 model object
 * @param model {object} - Swagger 1.2 model object
 * @returns {object} - Swagger 2.0 model object
*/
prototype.buildModel = function(oldModel) {
  var required = [];
  var properties = {};

  this.forEach(oldModel.properties, function(oldProperty, propertyName) {
    if (fixNonStringValue(oldProperty.required) === true) {
      required.push(propertyName);
    }

    properties[propertyName] = extend({},
      this.buildDataType(oldProperty),
      {description: oldProperty.description}
    );
  });

  required = oldModel.required || required;

  return extend({}, {
    description: oldModel.description,
    required: undefinedIfEmpty(required),
    properties: properties,
    discriminator: oldModel.discriminator
  });
};

/*
 * Convertes the "models" object of Swagger 1.2 specs to Swagger 2.0 definitions
 * object
 * @param oldModels {object} - an object containing Swagger 1.2 objects
 * @returns {object} - Swagger 2.0 definitions object
 * @throws {SwaggerConverterError}
*/
prototype.buildDefinitions = function(oldModels) {
  var models = {};

  this.forEach(oldModels, function(oldModel, modelId) {
    models[modelId] = this.buildModel(oldModel);
  });

  this.forEach(oldModels, function(parent, parentId) {
    this.forEach(parent.subTypes, function(childId) {
      var child = models[childId];

      if (!isValue(child)) {
        throw new SwaggerConverterError('subTypes resolution: Missing "' +
          childId + '" type');
      }

      if (!isValue(child.allOf)) {
        models[childId] = child = {allOf: [child]};
      }

      child.allOf.push({$ref: '#/definitions/' + parentId});
    });
  });

  return models;
};

/*
 * Iterates over elements of collection invoking iteratee for each element
 * @param collection {array|object} - the collection to iterate over
 * @parma iteratee {function} - the function invoked per iteration
*/
prototype.forEach = function(collection, iteratee) {
  if (!isValue(collection)) {
    return;
  }

  if (typeof collection !== 'object') {
    throw new SwaggerConverterError('Expected array or object, instead got: ' +
      JSON.stringify(collection, null, 2));
  }

  iteratee = iteratee.bind(this);
  if (Array.isArray(collection)) {
    collection.forEach(iteratee);
  }
  else {
    Object.keys(collection).forEach(function(key) {
      iteratee(collection[key], key);
    });
  }
};

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
 * Convert any path into absolute path
 * @param path {string} - path to convert
 * @returns {string} - result
*/
function absolutePath(path) {
  if (isValue(path) && path.charAt(0) !== '/') {
    return '/' + path;
  }
  return path;
}

/*
 * Test if value is empty and if so return undefined
 * @param value {*} - value to test
 * @returns {array|object|undefined} - result
*/
function undefinedIfEmpty(value) {
  return isEmpty(value) ? undefined : value;
}

/*
 * Filter out all non value elements(null, undefined) from array
 * @param collection {array} - the collection to filter
 * @returns {array} - result
*/
function removeNonValues(collection) {
  if (!isValue(collection)) {
    return collection;
  }

  assert(Array.isArray(collection));

  var result = [];
  collection.forEach(function(value) {
    if (isValue(value)) {
      result.push(value);
    }
  });
  return result;
}

/*
 * Test if value isn't null or undefined
 * @param value {*} - value to test
 * @returns {boolean} - result of test
*/
function isValue(value) {
  //Some implementations use empty strings as undefined.
  //For all fields we can drop empty string without any problems.
  //One notable exception is 'default' values, but it better to
  //skip it instead of providing unintended value.
  if (value === '') {
    return false;
  }

  return (value !== undefined && value !== null);
}

/*
 * Get length of container(Array or Object).
 * @param value {*} - container
 * @returns {number} - length of container
*/
function getLength(value) {
  if (typeof value !== 'object') {
    return 0;
  }

  if (isValue(value.length)) {
    return value.length;
  }

  return Object.keys(value).length;
}

/*
 * Test if value is empty
 * @param value {*} - value to test
 * @returns {boolean} - result of test
*/
function isEmpty(value) {
  return (getLength(value) === 0);
}

/*
 * Get property value of object
 * @param object {*} - object
 * @returns {*} - property value
*/
function getValue(object) {
  for (var i = 1; i < arguments.length && isValue(object); ++i) {
    var propertyName = arguments[i];
    assert(typeof propertyName === 'string');
    object = object[propertyName];
  }
  return object;
}

/*
 * Convert string values into the proper type.
 * @param value {*} - value to convert
 * @param skipError {boolean} - skip error during conversion
 * @returns {*} - transformed modles object
 * @throws {SwaggerConverterError}
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

    throw new SwaggerConverterError('incorect property value: ' + e.message);
  }
}
