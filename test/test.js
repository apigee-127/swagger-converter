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

var fs = require('fs');
var path = require('path');
var convert = require('..').convert;
var expect = require('chai').expect;
var sway = require('sway');
var Immutable = require('seamless-immutable');
var inputPath = './test/input/';
var outputPath = './test/output/';

require('mocha-jshint')();
require('mocha-jscs')();

var inputs = [
  {
    resourceListing: 'minimal/index.json',
    apiDeclarations: {
      '/pets': 'minimal/pets.json',
      '/stores': 'minimal/stores.json'
    },
    output: 'minimal.json'
  },
  {
    resourceListing: 'embedded/index.json',
    apiDeclarations: {},
    output: 'embedded.json'
  },
  {
    resourceListing: 'petstore/index.json',
    apiDeclarations: {
      '/pet': 'petstore/pet.json',
      '/user': 'petstore/user.json',
      '/store': 'petstore/store.json'
    },
    // TODO: petstore example output is not perfect output. Update the output
    output: 'petstore.json'
  },
  {
    resourceListing: 'complex-parameters/index.json',
    apiDeclarations: {},
    output: 'complex-parameters.json'
  },
  {
    resourceListing: 'complex-parameters/index.json',
    apiDeclarations: {},
    options: {
      collectionFormat: 'multi'
    },
    output: 'complex-parameters-multi.json'
  },
  {
    resourceListing: 'fixable/index.json',
    apiDeclarations: {
      '/pets': 'fixable/pets.json',
      '/stores': 'fixable/stores.json'
    },
    output: 'fixable.json'
  },
  {
    resourceListing: 'complex-models/index.json',
    apiDeclarations: {
      '/projects': 'complex-models/projects.json'
    },
    output: 'complex-models.json'
  }
];

// Run testInput for each input folder
inputs.forEach(testInput);

function testInput(input) {
  var outputFile = fs.readFileSync(path.join(outputPath, input.output));
  var outputObject = JSON.parse(outputFile.toString());
  var resourceListingPath = path.join(inputPath, input.resourceListing);
  var resourceListingFile = fs.readFileSync(resourceListingPath).toString();
  var resourceListing = JSON.parse(resourceListingFile);
  var apiDeclarations = {};

  for (var key in input.apiDeclarations) {
    var apiDeclaration = input.apiDeclarations[key];
    var apiDeclarationPath = path.join(inputPath, apiDeclaration);
    var apiDeclarationFile = fs.readFileSync(apiDeclarationPath).toString();
    apiDeclarations[key] = JSON.parse(apiDeclarationFile);
  }

  // Make resourceListing and apiDeclarations Immutable to make sure API is
  // working without touching the input objects
  resourceListing = new Immutable(resourceListing);
  apiDeclarations = new Immutable(apiDeclarations);

  // Do the conversion
  var converted = convert(resourceListing, apiDeclarations, input.options);

  // For debugging:
  // fs.writeFileSync(input.output + '-converted',
  //   JSON.stringify(converted, null, 4));

  describe('converting file: ' + input.resourceListing, function() {
    describe('output', function() {

      it('should be an object', function() {
        expect(converted).is.a('object');
      });

      it('should have info property and required properties', function() {
        expect(converted).to.have.property('info').that.is.a('object');
        expect(converted.info).to.have.property('title').that.is.a('string');
      });

      it('should have paths property that is an object', function() {
        expect(converted).to.have.property('paths').that.is.a('object');
      });

      it('should generate valid Swagger 2.0 document', function() {
        return sway.create({definition: converted})
          .then(function(swaggerObj) {

            var result = swaggerObj.validate();

            expect(result.errors).to.deep.equal([]);
            expect(result.warnings.filter(function(warning) {

              // FIXME: fix Petstore input and output files
              // Petstore has two unused definitions. We forgive this warning
              // because of that example
              return warning.code !== 'UNUSED_DEFINITION';
            })).to.deep.equal([]);
          });
      });

      it('should produce the same output as output file', function() {
        expect(converted).to.deep.equal(outputObject);
      });
    });
  });

}
