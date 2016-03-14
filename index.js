/*
 * @license
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
var URI = require('urijs');
var commonPrefix = require('common-prefix');

var SwaggerConverter = module.exports = {};

/**
 * Swagger Converter Error
 * @param {string} message - error message
 */
function SwaggerConverterError(message) {
  this.message = message;
  this.stack = (new Error(message)).stack;
}
SwaggerConverterError.prototype = Object.create(Error.prototype);
SwaggerConverterError.prototype.name = 'SwaggerConverterError';

/*
 * List all apiDeclarations refenced in resourceListing
 * @param sourceUrl {string} - source URL for root Swagger 1.x document
 * @param resourceListing {object} - root Swagger 1.x document
 * @returns {object} - map of apiDeclarations paths to absolute URLs
*/
SwaggerConverter.listApiDeclarations = function(sourceUrl, resourceListing) {
  /*
   * Warning: This code is intended to cover us much as possible real-life
   * cases and was tested using hundreds of public Swagger documents. If you
   * change code please do not introduce any breaking changes.
   * Possible workaround: you can alter algorithm by add/change 'basePath'
   * before passing it into this function.
  */
  sourceUrl = URI(sourceUrl || '').query('');

  var baseUrl = URI(resourceListing.basePath || '');
  if (baseUrl.is('relative')) {
    baseUrl = baseUrl.absoluteTo(sourceUrl);
  }

  if (resourceListing.swaggerVersion === '1.0' && baseUrl.suffix() === 'json') {
    baseUrl.filename('');
  }

  var result = {};
  resourceListing.apis.forEach(function(api) {
    // skip embedded documents
    if (!isValue(api.path) || isValue(api.operations)) {
      return;
    }

    var resourceUrl = URI(api.path.replace('{format}', 'json'));
    if (resourceUrl.is('relative')) {
      resourceUrl = URI(baseUrl.href() + resourceUrl.href());
    }
    result[api.path] = resourceUrl.normalize().href();
  });

  return result;
};

/*
 * Converts Swagger 1.x specs file to Swagger 2.0 specs.
 * @param resourceListing {object} - root Swagger 1.x document where it has a
 *  list of all paths
 * @param apiDeclarations {object} - a map with paths as keys and resources as values
 * @param options {object} - additonal options
 * @returns {object} - Fully converted Swagger 2.0 document
*/
SwaggerConverter.convert = function(resourceListing, apiDeclarations, options) {
  if (Array.isArray(apiDeclarations)) {
    throw new SwaggerConverterError(
      'Second argument(apiDeclarations) should be plain object, ' +
      'see release notes.');
  }

  var converter = new Converter();
  converter.options = options || {};
  return converter.convert(resourceListing, apiDeclarations);
};

var Converter = function() {};
var prototype = Converter.prototype;

/*
 * Converts Swagger 1.x specs file to Swagger 2.0 specs.
 * @param resourceListing {object} - root of Swagger 1.x document
 * @param apiDeclarations {object} - a map with paths as keys and resources as values
 * @returns {object} - Fully converted Swagger 2.0 document
*/
prototype.convert = function(resourceListing, apiDeclarations) {
  assert(typeof resourceListing === 'object');
  assert(typeof apiDeclarations === 'object');

  var resources = this.getResources(resourceListing, apiDeclarations);
  var tags = this.buildTags(resourceListing, resources);
  var securityDefinitions =
    this.buildSecurityDefinitions(resourceListing.authorizations);
  var paths = {};
  var definitions = {};

  this.customTypes = [];
  this.forEach(resources, function(resource) {
    if (isValue(resource.models)) {
      //TODO: check that types don't overridden
      this.customTypes = this.customTypes.concat(Object.keys(resource.models));
    }
  });

  this.forEach(resources, function(resource, index) {
    var operationTags;

    var tag = tags[index];
    if (isValue(tag)) {
      operationTags = [tag.name];
    }

    extend(definitions, this.buildDefinitions(resource.models));
    extend(paths, this.buildPaths(resource, operationTags));
  });

  return extend({},
    this.aggregatePathComponents(resourceListing, apiDeclarations),
    {
      swagger: '2.0',
      info: this.buildInfo(resourceListing),
      tags: undefinedIfEmpty(tags),
      paths: undefinedIfEmpty(paths),
      securityDefinitions: undefinedIfEmpty(securityDefinitions),
      definitions: undefinedIfEmpty(definitions)
    }
  );
};

/*
 * Get list of resources.
 * @param resourceListing {object} - root of Swagger 1.x document
 * @param apiDeclarations {object} - a map with paths as keys and resources as values
 * @returns {array} - list of resources
*/
Converter.prototype.getResources = function(resourceListing, apiDeclarations) {
  var resources = [];
  var embedded = false;
  this.forEach(resourceListing.apis, function(resource) {
    var path = resource.path;

    if (!isValue(path) || !isEmpty(resource.operations)) {
      embedded = true;
      return;
    }

    if (embedded) {
      throw new SwaggerConverterError(
        'Resource listing can not have both operations and API declarations.');
    }

    resource = apiDeclarations[path];
    if (!isValue(resource)) {
      throw new SwaggerConverterError(
        'resourceListing addressing missing declaration on path: ' + path);
    }
    resources.push(resource);
  });

  if (embedded) {
    return [resourceListing];
  }
  return resources;
};

/*
 * Builds "tags" section of Swagger 2.0 document
 * @param resourceListing {object} - root of Swagger 1.x document
 * @param resources {object} - list of resources
 * @returns {array} - list of Swagger 2.0 tags
*/
Converter.prototype.buildTags = function(resourceListing, resources) {
  var resourcePaths = [];

  if (this.options.buildTagsFromPaths !== true) {
    resourcePaths = this.mapEach(resources, function(resource) {
      return resource.resourcePath;
    });

    //'resourcePath' is optional parameter and also frequently have invalid values
    // if so than we discard all values and use resource paths for listing instead.
    if (getLength(removeDuplicates(resourcePaths)) < getLength(resources)) {
      resourcePaths = [];
    }
  }

  if (isEmpty(resourcePaths)) {
    resourcePaths = this.mapEach(resourceListing.apis, function(resource) {
      return resource.path;
    });
  }

  resourcePaths = stripCommonPath(resourcePaths);

  var tags = [];
  this.forEach(resourceListing.apis, function(resource, index) {
    if (!isEmpty(resource.operations)) { return; }

    var tagName = URI(resourcePaths[index] || '').path(true)
      .replace('{format}', 'json')
      .replace(/\/$/, '')
      .replace(/.json$/, '');

    if (!isValue(tagName)) { return; }

    tags.push(extend({}, {
      name: tagName,
      description: resource.description
    }));
  });

  return tags;
};

/*
 * Builds "info" section of Swagger 2.0 document
 * @param resourceListing {object} - root of Swagger 1.x document
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
 * @param resourceListing {object} - root of Swagger 1.x document
 * @param apiDeclarations {array} - a list of resources
 * @returns {object} - Swagger 2.0 path components
 * @throws {SwaggerConverterError}
*/
prototype.aggregatePathComponents = function(resourceListing, apiDeclarations) {
  var path = extend({}, this.buildPathComponents(resourceListing.basePath));

  var globalBasePath;
  this.forEach(apiDeclarations, function(api) {
    var basePath = api.basePath;
    //Test if basePath is relative(start with '.' or '..').
    if (/^\.\.?(\/|$)/.test(basePath)) {
      basePath = URI(basePath).absoluteTo(path.basePath).path(true);
    }

    //TODO: Swagger 1.x support per resource 'basePath', but Swagger 2.0 doesn't
    // solution could be to create separate spec per each 'basePath'.
    if (isValue(globalBasePath) && basePath !== globalBasePath) {
      throw new SwaggerConverterError(
        'Resources can not override each other basePaths');
    }
    globalBasePath = basePath;
  });

  return extend(path, this.buildPathComponents(globalBasePath));
};

/*
 * Get host, basePath and schemes for Swagger 2.0 result document from
 * Swagger 1.x basePath.
 * @param basePath {string} - the base path from Swagger 1.x
 * @returns {object} - Swagger 2.0 path components
*/
prototype.buildPathComponents = function(basePath) {
  if (!basePath) { return {}; }

  var url = URI(basePath).absoluteTo('/');
  var protocol = url.protocol();
  return extend({}, {
    host: url.host(),
    basePath: url.path(true),
    schemes: protocol && [protocol]
  });
};

/*
 * Builds a Swagger 2.0 type properties from a Swagger 1.x type properties
 *
 * @param oldDataType {object} - Swagger 1.x type object
 *
 * @returns {object} - Swagger 2.0 equivalent
 * @throws {SwaggerConverterError}
 */
prototype.buildTypeProperties = function(oldType, allowRef) {
  if (!oldType) { return {}; }
  assert(typeof allowRef === 'boolean');

  oldType = oldType.trim();

  if (allowRef && this.customTypes.indexOf(oldType) !== -1) {
    return {$ref: '#/definitions/' + oldType};
  }

  var typeMap = {
    //Swagger 1.x types
    integer:     {type: 'integer'},
    number:      {type: 'number'},
    string:      {type: 'string'},
    boolean:     {type: 'boolean'},
    array:       {type: 'array'},
    object:      {type: 'object'},
    file:        {type: 'file'},
    void:        {},
    //Swagger 1.1 types
    int:         {type: 'integer', format: 'int32'},
    long:        {type: 'integer', format: 'int64'},
    float:       {type: 'number',  format: 'float'},
    double:      {type: 'number',  format: 'double'},
    byte:        {type: 'string',  format: 'byte'},
    date:        {type: 'string',  format: 'date'},
    list:        {type: 'array'},
    set:         {type: 'array', uniqueItems: true},
    //JSON Schema Draft-3
    any:         {},
    //Unofficial but very common mistakes
    datetime:    {type: 'string',  format: 'date-time'},
    'date-time': {type: 'string',  format: 'date-time'},
    map:         {type: 'object'}
  };

  var type = typeMap[oldType.toLowerCase()];
  if (isValue(type)) {
    return type;
  }

  //handle "<TYPE>[<ITEMS>]" types from 1.1 spec
  //use RegEx with capture groups to get <TYPE> and <ITEMS> values.
  var match = oldType.match(/^([^[]*)\[(.*)\]$/);
  if (isValue(match)) {
    var collection = match[1].toLowerCase();
    var items = match[2];

    //handle "Map[String,<VALUES>]" types
    //see https://github.com/swagger-api/swagger-core/issues/244
    if (collection === 'map') {
      var commaIndex = items.indexOf(',');
      var keyType = items.slice(0, commaIndex);
      var valueType = items.slice(commaIndex + 1);
      if (keyType.toLowerCase() === 'string') {
        return {
          additionalProperties: this.buildTypeProperties(valueType, allowRef)
        };
      }
    }
    else {
      type = typeMap[collection];
      if (isValue(type)) {
        type.items = this.buildTypeProperties(items, allowRef);
        return type;
      }
    }
  }

  //At this point we know that it not standard type, but at the same time we
  //can't find such user type. To proceed further we just add it as is.
  //TODO: add warning
  return allowRef ? {$ref: '#/definitions/' + oldType} : {type: oldType};
};

/*
 * Builds a Swagger 2.0 data type properties from a Swagger 1.x data type properties
 *
 * @see {@link https://github.com/swagger-api/swagger-spec/blob/master/versions/
 *  1.x.md#433-data-type-fields}
 *
 * @param oldDataType {object} - Swagger 1.x data type object
 *
 * @returns {object} - Swagger 2.0 equivalent
 */
prototype.buildDataType = function(oldDataType, allowRef) {
  if (!oldDataType) { return {}; }
  assert(typeof oldDataType === 'object');
  assert(typeof allowRef === 'boolean');

  var oldTypeName = oldDataType.type || oldDataType.dataType ||
    oldDataType.responseClass || oldDataType.$ref;

  var result = this.buildTypeProperties(oldTypeName, allowRef);

  var oldItems = oldDataType.items;
  if (isValue(oldItems)) {
    if (typeof oldItems === 'string') {
      oldItems = {type: oldItems};
    }
    oldItems = this.buildDataType(oldItems, allowRef);
  }

  //TODO: handle '0' in default
  var defaultValue = oldDataType.default || oldDataType.defaultValue;
  if (result.type !== 'string') {
    defaultValue = fixNonStringValue(defaultValue, true);
  }

  //TODO: support 'allowableValues' from 1.1 spec

  extend(result, {
    format: oldDataType.format,
    items: oldItems,
    uniqueItems: fixNonStringValue(oldDataType.uniqueItems),
    minimum: fixNonStringValue(oldDataType.minimum),
    maximum: fixNonStringValue(oldDataType.maximum),
    default: defaultValue,
    enum: oldDataType.enum,
  });

  if (result.type === 'array' && !isValue(result.items)) {
    result.items = {};
  }

  return result;
};

/*
 * Builds a Swagger 2.0 paths object form a Swagger 1.x path object
 * @param apiDeclaration {object} - Swagger 1.x apiDeclaration
 * @param tag {array} - array of Swagger 2.0 tag names
 * @returns {object} - Swagger 2.0 path object
*/
prototype.buildPaths = function(apiDeclaration, tags) {
  var paths = {};

  var operationDefaults = {
    produces: apiDeclaration.produces,
    consumes: apiDeclaration.consumes,
    tags: tags,
    security: undefinedIfEmpty(
      this.buildSecurity(apiDeclaration.authorizations))
  };

  this.forEach(apiDeclaration.apis, function(api) {
    if (!isValue(api.operations)) { return; }

    var pathString = URI(api.path).absoluteTo('/').path(true);
    pathString = pathString.replace('{format}', 'json');

    if (!isValue(paths[pathString])) {
      paths[pathString] = {};
    }
    var path = paths[pathString];

    this.forEach(api.operations, function(oldOperation) {
      var method = oldOperation.method || oldOperation.httpMethod;
      method = method.toLowerCase();
      path[method] = this.buildOperation(oldOperation, operationDefaults);
    });
  });

  return paths;
};

/*
 * Builds a Swagger 2.0 security object form a Swagger 1.x authorizations object
 * @param oldAuthorizations {object} - Swagger 1.x authorizations object
 * @returns {object} - Swagger 2.0 security object
*/
prototype.buildSecurity = function(oldAuthorizations) {
  var security = [];
  this.mapEach(oldAuthorizations, function(oldScopes, oldName) {
    var names = this.securityNamesMap[oldName];
    if (isEmpty(names)) {
      //TODO: add warning
      names = [oldName];
    }

    this.forEach(names, function(name) {
      var requirement = {};
      requirement[name] = this.mapEach(oldScopes, function(oldScope) {
        return oldScope.scope;
      });
      security.push(requirement);
    });
  });
  return security;
};

/*
 * Builds a Swagger 2.0 operation object form a Swagger 1.x operation object
 * @param oldOperation {object} - Swagger 1.x operation object
 * @param operationDefaults {object} - defaults from containing apiDeclaration
 * @returns {object} - Swagger 2.0 operation object
*/
prototype.buildOperation = function(oldOperation, operationDefaults) {
  var parameters = [];

  this.forEach(oldOperation.parameters, function(oldParameter) {
    parameters.push(this.buildParameter(oldParameter));
  });

  /*
   * Merges the tags from the resourceListing and the ones specified in the apiDeclaration.
   */
  var tags = (operationDefaults.tags || []).concat(oldOperation.tags || []);
  tags = removeDuplicates(tags);

  return extend({}, operationDefaults, {
    operationId: oldOperation.nickname,
    summary: oldOperation.summary,
    description: oldOperation.description || oldOperation.notes,
    tags: undefinedIfEmpty(tags),
    deprecated: fixNonStringValue(oldOperation.deprecated),
    produces: oldOperation.produces,
    consumes: oldOperation.consumes,
    parameters: undefinedIfEmpty(parameters),
    responses: this.buildResponses(oldOperation),
    security: undefinedIfEmpty(this.buildSecurity(oldOperation.authorizations))
  });
};

/*
 * Builds a Swagger 2.0 responses object form a Swagger 1.x responseMessages object
 * @param oldOperation {object} - Swagger 1.x operation object
 * @returns {object} - Swagger 2.0 response object
*/
prototype.buildResponses = function(oldOperation) {
  var responses = {
    '200': {description: 'No response was specified'}
  };

  this.forEach(oldOperation.responseMessages, function(oldResponse) {
    var code = '' + oldResponse.code;
    responses[code] = extend({}, {
      description: oldResponse.message || 'Description was not specified',
      schema: undefinedIfEmpty(
        this.buildTypeProperties(oldResponse.responseModel, true))
    });
  });

  extend(responses['200'], {
    schema: undefinedIfEmpty(this.buildDataType(oldOperation, true))
  });

  return responses;
};

/*
 * Converts Swagger 1.x parameter object to Swagger 2.0 parameter object
 * @param oldParameter {object} - Swagger 1.x parameter object
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

  this.forEach(oldParameter, function(oldProperty, name) {
    if (name.match(/^X-/i) !== null) {
      parameter[name] = oldProperty;
    }
  });

  if (parameter.in === 'form') {
    parameter.in = 'formData';
  }

  if (oldParameter.paramType === 'body') {
    parameter.schema = this.buildDataType(oldParameter, true);
    if (!isValue(parameter.name)) {
      parameter.name = 'body';
    }
    return parameter;
  }

  var schema = this.buildDataType(oldParameter, false);

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

  //According to Swagger 2.0 spec: If the parameter is in "path",
  //this property is required and its value MUST be true.
  if (parameter.in === 'path') {
    schema.required = true;
  }

  var collectionFormat = this.options.collectionFormat;
  if (isValue(collectionFormat) && schema.type === 'array') {
    //'multi' is valid only for parameters in "query" or "formData".
    if (collectionFormat !== 'multi' ||
      ['path', 'formData'].indexOf(parameter.in) === -1) {
      schema.collectionFormat = this.options.collectionFormat;
    }
  }

  return extend(parameter, schema);
};

/*
 * Converts Swagger 1.x authorization definitions into Swagger 2.0 definitions
 * Definitions couldn't be converted 1 to 1, 'this.securityNamesMap' should be
 * used to map between Swagger 1.x names and one or more Swagger 2.0 names.
 *
 * @param oldAuthorizations {object} - The Swagger 1.x Authorizations definitions
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
    // For OAuth2 types, 1.x describes multiple "flows" in one authorization
    // object. But for 2.0 we need to create one security definition per flow.
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
 * Converts a Swagger 1.x model object to a Swagger 2.0 model object
 * @param model {object} - Swagger 1.x model object
 * @returns {object} - Swagger 2.0 model object
*/
prototype.buildModel = function(oldModel) {
  var required = [];
  var properties = {};
  var items;

  this.forEach(oldModel.properties, function(oldProperty, propertyName) {
    if (fixNonStringValue(oldProperty.required) === true) {
      required.push(propertyName);
    }

    properties[propertyName] = this.buildModel(oldProperty);
  });

  if (Array.isArray(oldModel.required)) {
    required = oldModel.required;
  }

  if (isValue(oldModel.items)) {
    items = this.buildModel(oldModel.items);
  }

  return extend(this.buildDataType(oldModel, true),
  {
    description: oldModel.description,
    required: undefinedIfEmpty(required),
    properties: undefinedIfEmpty(properties),
    discriminator: oldModel.discriminator,
    example: oldModel.example,
    items: undefinedIfEmpty(items),
  });
};

/*
 * Converts the "models" object of Swagger 1.x specs to Swagger 2.0 definitions
 * object
 * @param oldModels {object} - an object containing Swagger 1.x objects
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
 * Map elements of collection into array by invoking iteratee for each element
 * @param collection {array|object} - the collection to iterate over
 * @parma iteratee {function} - the function invoked per iteration
 * @returns {array|undefined} - result
*/
prototype.mapEach = function(collection, iteratee) {
  var result = [];
  this.forEach(collection, function(value, key) {
    result.push(iteratee.bind(this)(value, key));
  });
  return result;
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
    //In some cases order of iteration influence order of arrays in output.
    //To have stable result of convertion, keys need to be sorted.
    Object.keys(collection).sort().forEach(function(key) {
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
 * Test if value is empty and if so return undefined
 * @param value {*} - value to test
 * @returns {array|object|undefined} - result
*/
function undefinedIfEmpty(value) {
  return isEmpty(value) ? undefined : value;
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
 * @returns {*} - transformed model object
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

/*
 * Remove duplicates of an array
 * @params collection {array}
 * @returns {array} - collection without duplicates
 */
function removeDuplicates(collection) {
  return collection.filter(function(e, i, arr) {
    return isValue(e) && arr.lastIndexOf(e) === i;
  });
}

/*
 * Strip common prefix from paths
 * @params paths {array}
 * @returns {array} - path with remove common part
 */
function stripCommonPath(paths) {
  var prefix = commonPrefix(paths);
  var prefixLength = prefix.lastIndexOf('/') + 1;

  return paths.map(function(str) {
    return str.slice(prefixLength);
  });
}
