/*
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

var fs = require('fs');

/*
 * Fetches a remote or local location and returns file contents
 * @param uri {string} - URL to remote resource or file path for local file
 * @param callback {function} - A function that will called with error and the
 *  content of required JSON file arguments
*/
module.exports = function getFile(uri, callback) {
  // FIXME: for now getFile only works in Node.js environment and for local
  // files. getFile should work in browser and also for remote files

  if (typeof callback !== 'function') {
    throw new Error('callback function is required for getFile');
  }

  fs.readFile(uri, function(error, file) {
    var json = null;

    if (error) {
      return callback(error);
    }

    try {
      json = JSON.parse(file.toString());
    } catch (jsonError) {
      return callback(jsonError);
    }

    callback(error, json);

  });
};
