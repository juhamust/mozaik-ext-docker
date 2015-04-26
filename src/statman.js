var _ = require('lodash');
var util = require('util');
var EventEmitter = require("events").EventEmitter;
var Promise = require('bluebird');
var request = Promise.promisifyAll(require('request'));
var Datastore = require('nedb');
var Docker = require('dockerode');

var docker;
var statMen = {};


/**
 *
 * @example
 *
 * var statMan = StatMan.get('mycontainer');
 * if (!statMan.running) {
 *   statMan.start();
 * }
 *
 */
class StatMan extends EventEmitter {

  constructor(name, opts) {
    super();

    this.db;
    this.running = false;
    this.name = name;
    this.docker = new Docker(opts);

    this.container = {
      name: name,
      status: 'unknown',
      uptime: 0
    };

    opts = opts || {};

    // Use provided logger
    this.logger = opts.logger || console;

    // Initiate datastorage for entries
    if (opts.storagePath) {
      this.db = new Datastore({ filename: storagePath, autoload: true });
    } else {
      this.logger.warn('No persitent data storage defined - using memory only');
      this.db = new Datastore();
    }
  }

  start(opts, id) {
    opts = opts || {};

    if (this.running) {
      return;
    }

    this.logger.info('Starting StatMan');

    var container = this.docker.getContainer(id);

    container.stats((err, statStream) => {
      if (err) {
        this.logger.error(err);
        return Promise.reject(err);
      }

      this.statStream = statStream;

      // Listen for data events
      statStream.on('data', (chunk) => {
        //console.log('STATS', chunk.toString());
        this.updateStat(chunk).then((doc) => {
          this.emit('update', doc);
        });
      });

      this.running = true;
    });
  }

  stop() {
    if (this.statStream) {
      this.statStream.destroy();
    }
    this.running = false;
  }

  /**
   * Drops the datastorage as whole
   * @return {Promise} Promise that gets resolved with number of docs removed
   */
  flush() {
    return new Promise((resolve, reject) => {
      this.db.remove({ }, { multi: true }, (err, numRemoved) => {
        if (err) {
          return reject(err);
        }
        return resolve(numRemoved);
      });
    });
  }

  getContainers() {
    var containerList = [];

    return new Promise((resolve, reject) => {
      this.docker.listContainers((err, containers) => {
        if (err) {
          return reject(err);
        }

        for (var containerInfo of containers) {
          console.log(containerInfo);
          containerList.push({
            id: containerInfo.Id,
            names: containersInfo.Names
          });
        }

        return resolve(containerList);
      });
    });
  }

  /**
   * Get latest stat entries, sorted by the time
   * @param  {Integer} count Number of stat entries to return. Defaults to all
   * @return {Array}         Stat entries in a list
   */
  getStats(count) {
    return new Promise((resolve, reject) => {
      this.db
        .find({})
        .sort({ created: 1 })
        .exec((err, docs) => {
          if (err) {
            return reject(err);
          }
          return resolve(docs);
        });
    });
  }

  /**
   * Parse stat info and writes it into storage
   * @param  {Object} statInfo Response from GitDock
   * @return {Promise}          Promise
   */
  updateStat(statInfo) {
    var entry = {
      read: statInfo.read,
      cpu: {
        // FIXME: statInfo.cpu_stats.percent
        percent: 10
      },
      network: {
        out: {
          drops: statInfo.network.tx_dropped,
          errors: statInfo.network.tx_errors,
          bytes: statInfo.network.tx_bytes
        },
        in: {
          drops: statInfo.network.tr_dropped,
          errors: statInfo.network.tr_errors,
          bytes: statInfo.network.tr_bytes
        }
      }
    };

    // Update status
    // TODO: Parse
    this.container.uptime = statInfo.status;


    // Write to database and resolve when ready
    return new Promise((resolve, reject) => {
      this.db.insert(_.clone(entry), (err, doc) => {
        if (err) {
          this.logger.info(err, 'Failed write entry into db');
          return reject(err);
        }
        return resolve(doc);
      });
    })

  }

};


StatMan.get = (name, opts) => {
  var statMan = statMen[name];
  if (!statMan) {
    statMen[name] = new StatMan(name);
    statMan = statMen[name];
  }

  return statMan;
};


module.exports = StatMan;