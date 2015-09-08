# Swagger Converter

[![NPM version][npm-image]][npm-link]
[![Build status][travis-image]][travis-link]
[![Coverage Status][coveralls-image]][coveralls-link]
[![Dependency status][deps-image]][deps-link]
[![devDependency status][devdeps-image]][devdeps-link]

[![Join the chat at https://gitter.im/apigee-127/swagger-converter](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/apigee-127/swagger-converter?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

> Converts [Swagger](http://swagger.io/) documents from version **`1.2`** to version **`2.0`**

### Installation
Use npm

```shell
npm install swagger-converter --save
```

### Usage

It's recommended to use command line tools like [**`swagger-tools`**][swagger-tools-npm] or [**`swagger-spec-converter`**][swagger-spec-converter] for converting your spec. This module will not handle validation and if your spec is not valid can produce invalid spec.

Swagger Converter expects two arguments.

* `resourceListing` is Swagger 1.2 entry point file.
* `apiDeclarations` is an array of objects that are listed in `resourceListing`

```javascript
var convert = require('swagger-converter');

var resourceListing = require('/path/to/petstore/index.json');

var apiDeclarations = [
  require('/path/to/petstore/pet.json'),
  require('/path/to/petstore/user.json'),
  require('/path/to/petstore/store.json')
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

[npm-image]: https://img.shields.io/npm/v/swagger-converter.svg?style=flat
[npm-link]: https://npmjs.org/package/swagger-converter
[travis-image]: https://img.shields.io/travis/apigee-127/swagger-converter.svg?style=flat
[travis-link]: https://travis-ci.org/apigee-127/swagger-converter
[coveralls-image]: https://coveralls.io/repos/apigee-127/swagger-converter/badge.svg?branch=master&service=github
[coveralls-link]: https://coveralls.io/github/apigee-127/swagger-converter?branch=master
[deps-image]: https://img.shields.io/david/apigee-127/swagger-converter.svg?style=flat
[deps-link]: https://david-dm.org/apigee-127/swagger-converter
[devdeps-image]: https://img.shields.io/david/dev/apigee-127/swagger-converter.svg?style=flat
[devdeps-link]: https://david-dm.org/apigee-127/swagger-converter#info=devDependencies
[swagger-tools-npm]: https://www.npmjs.com/package/swagger-tools
[swagger-spec-converter]: https://github.com/lucybot/api-spec-converter
