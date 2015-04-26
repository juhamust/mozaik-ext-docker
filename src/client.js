var _ = require('lodash');
var Promise = require('bluebird');

var config = require('./config');
var StatMan = require('./statman');


/**
 * @param {Mozaik} mozaik
 */
var client = function (mozaik) {
  mozaik.loadApiConfig(config);

  var storagePath = config.get('storagePath');

  return {
    container: function(params) {
      var statMan = StatMan.get(params.name || 'container');
    }
  }
};

module.exports = client;