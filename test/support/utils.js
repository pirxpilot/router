const assert = require('node:assert/strict');
const http = require('node:http');
const finalhandler = require('finalhandler');

const methods = http.METHODS.map(m => m.toLowerCase());
const request = require('supertest');

exports.createHitHandle = createHitHandle;
exports.createServer = createServer;
exports.rawrequest = rawrequest;
exports.request = request;
exports.shouldHaveBody = shouldHaveBody;
exports.shouldNotHaveBody = shouldNotHaveBody;
exports.shouldHitHandle = shouldHitHandle;
exports.shouldNotHitHandle = shouldNotHitHandle;

function createHitHandle(num) {
  const name = `x-fn-${String(num)}`;
  return function hit(_req, res, next) {
    res.setHeader(name, 'hit');
    next();
  };
}

function createServer(router) {
  return http.createServer(function onRequest(req, res) {
    router(req, res, finalhandler(req, res));
  });
}

function rawrequest(server) {
  const _headers = {};
  let _method;
  let _path;
  const _test = {};

  methods.forEach(method => {
    _test[method] = go.bind(null, method);
  });

  function expect(status, body, callback) {
    if (typeof status === 'string' && !callback) {
      _headers[status.toLowerCase()] = body;
      return this;
    }
    const { promise, resolve, reject } = Promise.withResolvers();

    let _server;

    if (!server.address()) {
      _server = server.listen(0, onListening);
      return promise;
    }

    onListening.call(server);
    return promise;

    function onListening() {
      const addr = this.address();
      const port = addr.port;

      const req = http.request({
        host: '127.0.0.1',
        method: _method,
        path: _path,
        port
      });
      req.on('response', res => {
        let buf = '';

        res.setEncoding('utf8');
        res.on('data', s => {
          buf += s;
        });
        res.on('end', () => {
          let err = null;

          try {
            for (const key in _headers) {
              assert.equal(res.headers[key], _headers[key]);
            }

            assert.equal(res.statusCode, status);
            assert.equal(buf, body);
          } catch (e) {
            err = e;
          }

          if (_server) {
            _server.close();
          }

          callback?.(err);
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
      req.end();
    }
  }

  function go(method, path) {
    _method = method;
    _path = path;

    return {
      expect
    };
  }

  return _test;
}

function shouldHaveBody(buf) {
  return res => {
    const body = !Buffer.isBuffer(res.body) ? Buffer.from(res.text) : res.body;
    assert.ok(body, 'response has body');
    assert.strictEqual(body.toString('hex'), buf.toString('hex'));
  };
}

function shouldHitHandle(num) {
  const header = `x-fn-${String(num)}`;
  return res => {
    assert.equal(res.headers[header], 'hit', `should hit handle ${num}`);
  };
}

function shouldNotHaveBody() {
  return res => {
    assert.ok(res.text === '' || res.text === undefined);
  };
}

function shouldNotHitHandle(num) {
  return shouldNotHaveHeader(`x-fn-${String(num)}`);
}

function shouldNotHaveHeader(header) {
  return res => {
    assert.ok(!(header.toLowerCase() in res.headers), `should not have header ${header}`);
  };
}
