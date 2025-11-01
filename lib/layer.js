import matcher from './matcher.js';

export default function Layer(path, opts = {}, fn, method) {
  if (typeof fn !== 'function') {
    throw new TypeError('argument handler must be a function');
  }
  this.handle = fn;
  this.keys = [];
  this.name = fn.name || '<anonymous>';
  this.params = undefined;
  this.path = undefined;
  this.slash = path === '/' && opts.end === false;
  this.matchers = this.slash ? [] : Array.isArray(path) ? path.map(p => matcher(p, opts)) : [matcher(path, opts)];
  this.method = method;
}

/**
 * Handle the error for the layer.
 *
 * @param {Error} error
 * @param {Request} req
 * @param {Response} res
 * @param {function} next
 * @api private
 */

Layer.prototype.handleError = function handleError(error, req, res, next) {
  const fn = this.handle;

  if (fn.length !== 4) {
    // not a standard error handler
    return next(error);
  }

  try {
    // invoke function
    const ret = fn(error, req, res, next);

    // wait for returned promise
    if (ret instanceof Promise) {
      ret.catch((error = new Error('Rejected promise')) => next(error));
    }
  } catch (err) {
    next(err);
  }
};

/**
 * Handle the request for the layer.
 *
 * @param {Request} req
 * @param {Response} res
 * @param {function} next
 * @api private
 */

Layer.prototype.handleRequest = function handleRequest(req, res, next) {
  const fn = this.handle;

  if (fn.length > 3) {
    // not a standard request handler
    return next();
  }

  try {
    // invoke function
    const ret = fn(req, res, next);

    // wait for returned promise
    if (ret instanceof Promise) {
      ret.catch((error = new Error('Rejected promise')) => next(error));
    }
  } catch (err) {
    next(err);
  }
};

/**
 * Check if this route matches `path`, if so
 * populate `.params`.
 *
 * @param {String} path
 * @return {Boolean}
 * @api private
 */

Layer.prototype.match = function match(path) {
  if (path != null) {
    // fast path non-ending match for / (any path matches)
    if (this.slash) {
      this.params = {};
      this.path = '';
      return true;
    }

    for (const matcher of this.matchers) {
      const matched = matcher(path);
      if (matched) {
        // store values
        this.params = matched.params;
        this.path = matched.path;
        this.keys = matched.keys;
        return true;
      }
    }
  }

  this.params = undefined;
  this.path = undefined;
  return false;
};
