/*global describe, it, before */

var convert = require('..');
var expect = require('chai').expect;
var SwaggerTools = require('swagger-tools');

/*
 * try to parse an API definition directly from a URL
 */
var url = "https://api.taxamo.com/swagger";

var converted = null;

describe('Converting directly from URL', function() {
	
	before(function(done) {
		
		/*
		 * convert the API directly from the base URL
		 */
		convert(url, function(err, data) {
			
			// store the converted API data globally
			converted = data;
			done();
		});
		
	});
	
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
		SwaggerTools.specs.v2.validate(converted, function(validationErrors) {
			expect(validationErrors).to.be.undefined;
		});
	});
	
});
