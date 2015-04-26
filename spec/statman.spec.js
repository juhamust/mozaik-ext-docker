var fs = require('fs');
var util = require('util');
var path = require('path');
var stream = require('stream');
var EventEmitter = require("events").EventEmitter;
var Promise = require('bluebird');
var proxyquire = require('proxyquire');



describe('StatMan', function() {
  var raw, container, statMan, testStream;

  // Load test JSON
  beforeEach(function(done) {
    raw = fs.readFileSync(path.join(__dirname, 'container.json')).toString();
    container = JSON.parse(raw);
    statMan = StatMan.get('test');
    // Clear db as start
    statMan.flush().then(done);

    // Create test stream
    util.inherits(TestStream, stream.Readable);
    function TestStream() {
      stream.Readable.call(this, { objectMode: true });
      //this.data = container;
    }

    TestStream.prototype._read = function() {
      this.push(container);
      //console.log(container.length);
      this.push(null);
      /*
      if (this.curIndex === this.data.length) {
        return this.push(null);
      }
      var data = this.data[this.curIndex++];
      console.log('read >>>: ' + JSON.stringify(data));
      this.push(data);
      */
    }

    TestStream.prototype.destroy = function() {
      this.push(null);
    };

    testStream = new TestStream();

  });

  // Mock request
  var StatMan = proxyquire('../lib/statman', {
    dockerode: function() {
      return {
        getContainer: function(){
          return {
            stats: function(cb) {
              //console.log('get container stats', container); //
              cb(null, testStream);

              //var stream = new TestStream();

              //stream.emit('data', container);
              // TODO: emit
            }
          }
        }
      }
    },
    request: {
      get: function(params, cb) {
        cb(null, { statusCode: 200 }, container);
      }
    }
  });


  it('sends event', function(done) {
    // Succeed or fail fast
    statMan.start({ interval: 100 });

    statMan.once('update', function(entry) {
      //console.log('UPDATE', entry);
      // See test data: container.json
      expect(entry.cpu.percent).toBe(10);
      statMan.stop();
      done();
    });
  });

  it('gets events', function(done) {
    // Insert one
    statMan.updateStat(container)
    .then(function() {
      // Insert one more
      return statMan.updateStat(container);
    })
    .then(function() {
      return statMan.getStats();
    })
    .then(function(stats) {
      //console.log('Stats', stats);
      expect(stats.length).toBe(2);
      done();
    });
  });

});