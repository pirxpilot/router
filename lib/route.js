const { METHODS } = require('node:http');
const Layer = require('./layer');

/**
 * Module variables.
 * @private
 */

module.exports = Route;

/**
 * Initialize `Route` with the given `path`,
 *
 * @param {String} path
 * @api private
 */

function Route(path) {
  this.path = path;
  this.stack = [];

  // route handlers for various http methods
  this.methods = new Set();
}

Route.prototype._handlesMethod = function _handlesMethod(method) {
  if (this.methods._all) {
    return true;
  }

  if (method === 'HEAD' && !this.methods.has('HEAD')) {
    method = 'GET';
  }

  return this.methods.has(method);
};

/**
 * @return {array} supported HTTP methods
 * @private
 */

Route.prototype._methods = function _methods() {
  const methods = [...this.methods];

  // append automatic head
  if (this.methods.has('GET') && !this.methods.has('HEAD')) {
    methods.push('HEAD');
  }

  return methods;
};

/**
 * dispatch req, res into this route
 *
 * @private
 */

Route.prototype.dispatch = function dispatch(req, res, done) {
  let idx = 0;
  const stack = this.stack;
  let sync = 0;

  if (stack.length === 0) {
    return done();
  }

  let { method } = req;
  if (method === 'HEAD' && !this.methods.has('HEAD')) {
    method = 'GET';
  }

  req.route = this;

  next();

  function next(err) {
    // signal to exit route
    if (err && err === 'route') {
      return done();
    }

    // signal to exit router
    if (err && err === 'router') {
      return done(err);
    }

    // no more matching layers
    if (idx >= stack.length) {
      return done(err);
    }

    // max sync stack
    if (++sync > 100) {
      return setImmediate(next, err);
    }

    let layer;
    let match;

    // find next matching layer
    while (idx < stack.length) {
      layer = stack[idx++];
      match = !layer.method || layer.method === method;
      if (match) {
        break;
      }
    }

    // no match
    if (match !== true) {
      return done(err);
    }

    if (err) {
      layer.handleError(err, req, res, next);
    } else {
      layer.handleRequest(req, res, next);
    }

    sync = 0;
  }
};

/**
 * Add a handler for all HTTP verbs to this route.
 *
 * Behaves just like middleware and can respond or call `next`
 * to continue processing.
 *
 * You can use multiple `.all` call to add multiple handlers.
 *
 *   function check_something(req, res, next){
 *     next()
 *   }
 *
 *   function validate_user(req, res, next){
 *     next()
 *   }
 *
 *   route
 *   .all(validate_user)
 *   .all(check_something)
 *   .get(function(req, res, next){
 *     res.send('hello world')
 *   })
 *
 * @param {array|function} handler
 * @return {Route} for chaining
 * @api public
 */

Route.prototype.all = function all(...args) {
  const callbacks = args.flat(Number.POSITIVE_INFINITY);

  if (callbacks.length === 0) {
    throw new TypeError('argument handler is required');
  }

  this.methods._all = true;
  this.stack.push(...callbacks.map(fn => new Layer('/', {}, fn)));

  return this;
};

METHODS.forEach(method => {
  Route.prototype[method.toLowerCase()] = function (...args) {
    const callbacks = args.flat(Number.POSITIVE_INFINITY);

    if (callbacks.length === 0) {
      throw new TypeError('argument handler is required');
    }

    this.methods.add(method);
    this.stack.push(...callbacks.map(fn => new Layer('/', {}, fn, method)));

    return this;
  };
});
