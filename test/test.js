var fs = require('fs');
var convert = require('..');
var expect = require('chai').expect;
var walk = require('walkdir');


describe('Converting', function(){
  [
    'minimal'
  ].forEach(testInput);
});


function testInput(fileName) {
  describe(fileName, function () {
    var input = './test/input/' + fileName + '/index.json';
    var outputFile = fs.readFileSync('./test/output/' + fileName + '.json');
    var outputObject = JSON.parse(outputFile.toString());
    var converted = convert(input);

    it('output should have minimum required properties', function() {
      expect(converted).is.a('object');
      expect(converted).to.have.property('info').that.is.a('object');
    });

    it('should produce the same output', function() {
      expect(converted).to.deep.equal(outputObject);
    });
  });
}