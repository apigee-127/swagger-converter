// TODO
module.exports = function getFile (at) {
  if (typeof window !== 'undefined') {
    // XHR
  } else {
    if (isURL(at)) {
      request(at);
    } else {
      fs.readFileSync(at);
    }
  }
};