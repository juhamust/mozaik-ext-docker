var _ = require('lodash');
var fs = require('fs');
var moment = require('moment');
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
    opts = opts || {};

    this.db;
    this.running = false;
    this.name = name;

    // Create connection to Docker
    if (!_.any([opts.socketPath, opts.host])) {
      throw Error('Either socketPath or host address for Docker needed');
    }

    // Read auth files for secure connection
    if (opts.certPath) {
       opts.ca = fs.readFileSync(opts.certPath + '/ca.pem');
       opts.cert = fs.readFileSync(opts.certPath + '/cert.pem');
       opts.key = fs.readFileSync(opts.certPath + '/key.pem');
    }

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

  start(id, opts) {
    opts = opts || {};

    if (this.running) {
      return;
    }

    this.logger.info('Starting StatMan', id);
    this._start(id, opts)
    .then(() => {
      this.running = true;
    })
    .catch((err) => {
      this.logger.error(err);
      this.running = false;
    });
  }

  /**
   * Start syncing the data from backend
   * @param  {String} id   Container identifier
   * @param  {Object} opts Optional options
   * @return {Promise}     Resolved when started/failed
   */
  _start(id, opts) {
    opts = opts || {};

    return new Promise((resolve, reject) => {
      var container = this.docker.getContainer(id);
      container.stats((err, statStream) => {
        if (err) {
          this.logger.error(err);
          return reject(err);
        }

        this.statStream = statStream;

        // Listen for data events
        statStream.on('data', (chunk) => {
          //console.log('STATS', chunk.toString());
          this.updateStat(chunk).then((doc) => {
            this.emit('data', doc);
          });
        });

        resolve();
      });
    });
  }

  stop() {
    this._stop()
    .then(() => {
      this.running = false;
    })
    .catch((err) => {
      this.logger.warn(err);
    });
  }

  _stop() {
    return new Promise((resolve, reject) => {
      if (this.statStream) {
        this.statStream.destroy();
      }
      return resolve();
    });
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

        //console.log('containers', containers)

        for (var containerInfo of containers) {
          console.log(containerInfo);
          containerList.push({
            image: containerInfo.Image,
            created: moment(containerInfo.Created * 1000).format(),
            id: containerInfo.Id,
            names: containerInfo.Names
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
        percent: this.calculatePercentCPU(statInfo),
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
    });

  }

  calculatePercentCPU(statInfo, prev) {
    prev = prev || {};
    // Implementation adapted from:
    // https://github.com/docker/docker/blob/b9be50b578f86e858113b9c334e1748e15b63263/api/client/stats.go#L168
    var cpuPercent = 0.0;
    var cpuDelta = statInfo.cpu_stats.cpu_usage.total_usage - (prev.cpu || 0);
    var systemDelta = statInfo.cpu_stats.system_cpu_usage - (prev.system || 0);

    if (systemDelta > 0.0 && cpuDelta > 0.0) {
      cpuPercent = (cpuDelta / systemDelta) * (statInfo.cpu_stats.cpu_usage.percpu_usage).length * 100.0;
    }
    return cpuPercent;
  }

};


StatMan.get = (name, opts) => {
  var statMan = statMen[name];
  if (!statMan) {
    statMen[name] = new StatMan(name, opts);
    statMan = statMen[name];
  }

  return statMan;
};


module.exports = StatMan;