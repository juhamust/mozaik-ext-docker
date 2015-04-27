var convict = require('convict');

var config = convict({
  docker: {
    socketPath: {
      doc: 'Path to Docker service socket. Defaults to null (use host instead)',
      default: null,
      format: String,
      env: 'DOCKER_SOCKET_PATH'
    },
    host: {
      doc: 'Host address of the Docker service. Defaults to null (use socket instead)',
      default: null,
      format: String,
      env: 'DOCKER_HOST'
    },
    port: {
      doc: 'Port address of the Docker service. Defaults to 3000',
      default: 3000,
      format: String,
      env: 'DOCKER_PORT'
    }
  }
});

module.exports = config;