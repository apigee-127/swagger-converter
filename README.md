# Swagger Converter

[![Build Status](https://travis-ci.org/apigee-127/swagger-converter.svg?branch=master)](https://travis-ci.org/apigee-127/swagger-converter)

Swagger Converter converts [Swagger](http://swagger.io/) documents from version **1.2** to version **2.0**

### Installation
Use npm

```shell
npm install swagger-converter --save
```

### Usage
Swagger Converter expects your Swagger 1.2 documents to follow Swagger 1.2 routing semantics. For example, if your root Swagger file like following code, you will need to have files that are located relatively to your root Swagger document.

**index.json**
```json
{
  "apiVersion": "1.0.0",
  "swaggerVersion": "1.2",
  "apis": [
    {
      "path": "/pet",
      "description": "Operations about pets"
    },
    {
      "path": "/user",
      "description": "Operations about user"
    },
    {
      "path": "/store",
      "description": "Operations about store"
    }
  ]
}
```
For Swagger Converter to work with this document, it needs to find `pet`, `user` and `store` files in the same location of `index.json`. It basically uses `path` values as a relative path in file system to find those files. So for this example, your file structure should look like this:

```
petstore/
├── index.json
├── pet
├── store
└── user
```

Now to convert this Swagger 1.2 document we can start from `index.json` as entry point:

```javascript
var converter = require('swagger-converter');
var pathToIndexJson = '/path/to/petstore/index.json';

converter.convert(pathToIndexJson, function(error, swagger2Document) {
  console.log(JSON.stringify(swagger2Document, null, 2);
});
```

### Development

Install dependencies with `npm install` command and use `npm test` to run the test. Tests will fail if you break coding style.

### License
MIT. See [LICENSE](./LICENSE)