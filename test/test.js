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

const fs = require('fs');
const path = require('path');

const sway = require('sway');
const { expect } = require('chai');
const { describe, it } = require('mocha');

const { convert, listApiDeclarations } = require('..');

const outputPath = './test/output/';
function readInputFile(filepath) {
  const fullPath = path.join('./test/input/', filepath);
  return JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
}

const inputs = [
  {
    resourceListing: 'minimal/index.json',
    apiDeclarations: {
      '/pets': 'minimal/pets.json',
      '/stores': 'minimal/stores.json',
    },
    output: 'minimal.json',
  },
  {
    resourceListing: 'embedded/index.json',
    apiDeclarations: {},
    output: 'embedded.json',
  },
  {
    resourceListing: 'petstore/index.json',
    apiDeclarations: {
      '/pet': 'petstore/pet.json',
      '/user': 'petstore/user.json',
      '/store': 'petstore/store.json',
    },
    // TODO: petstore example output is not perfect output. Update the output
    output: 'petstore.json',
  },
  {
    resourceListing: 'complex-parameters/index.json',
    apiDeclarations: {},
    output: 'complex-parameters.json',
  },
  {
    resourceListing: 'complex-parameters/index.json',
    apiDeclarations: {},
    options: { collectionFormat: 'multi' },
    output: 'complex-parameters-multi.json',
  },
  {
    resourceListing: 'fixable/index.json',
    apiDeclarations: {
      '/swagger_files/my/pets': 'fixable/pets.json',
      '/swagger_files/our/stores': 'fixable/stores.json',
    },
    output: 'fixable.json',
  },
  {
    resourceListing: 'complex-models/index.json',
    apiDeclarations: {
      '/projects': 'complex-models/projects.json',
    },
    output: 'complex-models.json',
  },
  {
    resourceListing: 'custom/index.json',
    apiDeclarations: {
      '/custom': 'custom/custom.json',
    },
    output: 'custom.json',
  },
];

// Run testInput for each input folder
inputs.forEach(testInput);
testListApiDeclarations();

function testInput(input) {
  let resourceListing = readInputFile(input.resourceListing);
  let apiDeclarations = {};

  for (const key in input.apiDeclarations) {
    apiDeclarations[key] = readInputFile(input.apiDeclarations[key]);
  }

  // Deep freeze resourceListing and apiDeclarations to make sure API is working without touching the input objects
  resourceListing = deepFreeze(resourceListing);
  apiDeclarations = deepFreeze(apiDeclarations);

  // Do the conversion
  const converted = convert(resourceListing, apiDeclarations, input.options);

  describe('converting file: ' + input.resourceListing, () => {
    it('output should generate valid Swagger 2.0 document', async () => {
      expect(converted).is.a('object');
      expect(converted).to.have.property('info').that.is.a('object');
      expect(converted.info).to.have.property('title').that.is.a('string');
      expect(converted).to.have.property('paths').that.is.a('object');

      const result = (await sway.create({ definition: converted })).validate();

      expect(result.errors).to.deep.equal([]);
      expect(
        result.warnings.filter(
          // FIXME: fix Petstore input and output files
          // Petstore has two unused definitions. We forgive this warning because of that example
          (warning) => warning.code !== 'UNUSED_DEFINITION',
        ),
      ).to.deep.equal([]);
    });

    it('output should produce the same output as output file', () => {
      const outputFilePath = path.join(outputPath, input.output);
      const fileContent = JSON.stringify(sortObject(converted), null, 2) + '\n';

      if (process.env.WRITE_CONVERTED) {
        fs.writeFileSync(outputFilePath, fileContent);
      }

      const outputFile = fs.readFileSync(outputFilePath, 'utf-8');
      expect(fileContent).to.deep.equal(outputFile);
    });
  });
}

function testListApiDeclarations() {
  describe('testing listApiDeclarations function', () => {
    it('simple case', () => {
      const declarations = listApiDeclarations(
        'http://test.com/api-docs.json',
        {
          swaggerVersion: '1.2',
          apis: [{ path: '/pet' }, { path: '/user' }, { path: '/store' }],
        },
      );

      expect(declarations).to.deep.equal({
        '/pet': 'http://test.com/api-docs.json/pet',
        '/user': 'http://test.com/api-docs.json/user',
        '/store': 'http://test.com/api-docs.json/store',
      });
    });

    it('embedded document', () => {
      const declarations = listApiDeclarations(
        'http://test.com/api-docs.json',
        {
          swaggerVersion: '1.2',
          apis: [
            { path: '/pet', operations: { method: 'GET' } },
            { path: '/user', operations: { method: 'GET' } },
            { path: '/store', operations: { method: 'GET' } },
          ],
        },
      );

      expect(declarations).to.deep.equal({});
    });

    it('version 1.0', () => {
      const declarations = listApiDeclarations(
        'http://test.com/api-docs.json',
        {
          swaggerVersion: '1.0',
          apis: [{ path: '/pet' }, { path: '/user' }, { path: '/store' }],
        },
      );

      expect(declarations).to.deep.equal({
        '/pet': 'http://test.com/pet',
        '/user': 'http://test.com/user',
        '/store': 'http://test.com/store',
      });
    });

    it('absolute paths', () => {
      const declarations = listApiDeclarations(
        'http://test.com/api-docs.json',
        {
          swaggerVersion: '1.2',
          apis: [
            { path: 'http://foo.com/pet' },
            { path: 'http://foo.com/user' },
            { path: 'http://foo.com/store' },
          ],
        },
      );

      expect(declarations).to.deep.equal({
        'http://foo.com/pet': 'http://foo.com/pet',
        'http://foo.com/user': 'http://foo.com/user',
        'http://foo.com/store': 'http://foo.com/store',
      });
    });

    it('basePath inside resourceListing', () => {
      const declarations = listApiDeclarations(
        'http://test.com/api-docs.json',
        {
          swaggerVersion: '1.2',
          basePath: 'http://bar.com',
          apis: [{ path: '/pet' }, { path: '/user' }, { path: '/store' }],
        },
      );

      expect(declarations).to.deep.equal({
        '/pet': 'http://bar.com/pet',
        '/user': 'http://bar.com/user',
        '/store': 'http://bar.com/store',
      });
    });

    it('URL with query parameter', () => {
      //Disclaimer: This weird test doesn't produced by author's sick fantasy
      //on a contrary it's taken from public Swagger spec and properly
      //handled by 'SwaggerUI'.
      const declarations = listApiDeclarations(
        'http://test.com/api-docs.json',
        {
          swaggerVersion: '1.2',
          basePath: 'http://bar.com?spec=',
          apis: [{ path: '/pet' }, { path: '/user' }, { path: '/store' }],
        },
      );

      expect(declarations).to.deep.equal({
        '/pet': 'http://bar.com/?spec=%2Fpet',
        '/user': 'http://bar.com/?spec=%2Fuser',
        '/store': 'http://bar.com/?spec=%2Fstore',
      });
    });
  });
}

function sortObject(src) {
  if (Array.isArray(src)) {
    return src.map(sortObject);
  }

  if (src != null && typeof src === 'object') {
    const out = {};

    const sortedKeys = Object.keys(src).sort((a, b) => a.localeCompare(b));
    for (const key of sortedKeys) {
      out[key] = sortObject(src[key]);
    }
    return out;
  }

  return src;
}

function deepFreeze(value) {
  if (value != null && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }

  return value;
}
