var fs = require('fs');
var path = require('path');
var convert = require('..');
var expect = require('chai').expect;

require('mocha-jshint')();
require('mocha-jscs')();

describe('Converting', function() {
  [
    'minimal'
  ].forEach(testInput);
});

function testInput(fileName) {
  describe(fileName, function() {
    var input = path.join('./test/input/', fileName, '/index.json');
    var outputPath = path.join('./test/output/', fileName + '.json');
    var outputFile = fs.readFileSync(outputPath);
    var outputObject = JSON.parse(outputFile.toString());
    var converted = convert(input);

    it('output should be an object', function() {
      expect(converted).is.a('object');
    });
    it('output should have info property and required properties', function() {
      expect(converted).to.have.property('info').that.is.a('object');
      expect(converted.info).to.have.property('title').that.is.a('string');
    });
    it('output should have paths property that is an object', function() {
      expect(converted).to.have.property('paths').tha.is.a('object');
    });

    it('should produce the same output as output file', function() {
      expect(converted).to.deep.equal(outputObject);
    });
  });
}
