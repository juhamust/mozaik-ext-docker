var convict = require('convict');

var config = convict({
  docker: {
    baseUrl: {
      doc: 'The TODO API base url.',
      default: null,
      format: String,
      env: 'DOCKER_BASE_URL'
    },
    username: {
      doc: 'The DOCKER API token.',
      default: null,
      format: String,
      env: 'DOCKER_TOKEN'
    }
  }
});

module.exports = config;