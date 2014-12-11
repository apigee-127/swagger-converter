# Swagger Converter

[![Build Status](https://travis-ci.org/apigee-127/swagger-converter.svg?branch=master)](https://travis-ci.org/apigee-127/swagger-converter)

Swagger Converter converts [Swagger](http://swagger.io/) documents from version **1.2** to version **2.0**

### Installation
Use npm

```shell
npm install swagger-converter --save
```

### Usage
Swagger Converter expects two arguments.

* `resourceListing` is Swagger 1.2 entry point file.
* `apiDeclarations` is an array of objects that are listed in `resourceListing`

```javascript
var convert = require('swagger-converter');
var fs = require('fs');
var resourceListing = JSON.parse(fs.readFileSync('/path/to/petstore/index.json').toString());
var apiDeclarations = [
  JSON.parse(fs.readFileSync('/path/to/petstore/pet.json').toString()),
  JSON.parse(fs.readFileSync('/path/to/petstore/user.json').toString()),
  JSON.parse(fs.readFileSync('/path/to/petstore/store.json').toString())
];

var swagger2Document = convert(resourceListing, apiDeclarations);

console.log(JSON.stringify(swagger2Document, null, 2));
```

##### In browser
Install via Bower
```
bower install --save swagger-converter
```
Include the `browser.js` script in your HTML
```html
  <script src="/path/to/swagger-converter/browser.js"></script>
```
Use the script
```javascript
var convert = SwaggerConverter.convert;
```

### Development

Install dependencies with `npm install` command and use `npm test` to run the test. Tests will fail if you break coding style.

##### Building for browser
Just run this command to make a new `browser.js`

```
npm run build
```
### License
MIT. See [LICENSE](./LICENSE)
