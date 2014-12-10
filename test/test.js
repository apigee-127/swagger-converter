var fs = require('fs');
var path = require('path');
var convert = require('..');
var expect = require('chai').expect;

require('mocha-jshint')();
require('mocha-jscs')();

// TODO: petstore example output is not perfect output. Update the output file
['minimal', 'embedded', 'petstore'].forEach(testInput);

function testInput(fileName) {
  var input = path.join('./test/input/', fileName, '/index.json');
  var outputPath = path.join('./test/output/', fileName + '.json');
  var outputFile = fs.readFileSync(outputPath);
  var outputObject = JSON.parse(outputFile.toString());

  convert(input, function(error, converted) {

    fs.writeFileSync(fileName + '-converted',
      JSON.stringify(converted, null, 4));

    describe('converting file: ' + fileName, function() {

      it('should have no errors', function() {
        expect(!!error).to.be.false;
      });

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

        it('should produce the same output as output file', function() {
          expect(converted).to.deep.equal(outputObject);
        });
      });
    });
  });
}
