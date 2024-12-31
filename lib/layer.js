/*!
 * router
 * Copyright(c) 2013 Roman Shtylman
 * Copyright(c) 2014-2022 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict'

/**
 * Module dependencies.
 * @private
 */

const pathRegexp = require('path-to-regexp')

/**
 * Module variables.
 * @private
 */

const TRAILING_SLASH_REGEXP = /\/+$/
const MATCHING_GROUP_REGEXP = /\((?:\?<(.*?)>)?(?!\?)/g

/**
 * Expose `Layer`.
 */

module.exports = Layer

function Layer (path, opts = {}, fn) {
  this.handle = fn
  this.keys = []
  this.name = fn.name || '<anonymous>'
  this.params = undefined
  this.path = undefined
  this.slash = path === '/' && opts.end === false
  this.matchers = Array.isArray(path) ? path.map(p => matcher(p, opts)) : [matcher(path, opts)]
}

function matcher (path, { sensitive, end, strict }) {
  return path instanceof RegExp
    ? createRegexMatcher(path)
    : pathRegexp.match((strict ? path : loosen(path)), {
      sensitive,
      end,
      trailing: !strict,
      decode: decodeParam
    })
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

Layer.prototype.handleError = function handleError (error, req, res, next) {
  const fn = this.handle

  if (fn.length !== 4) {
    // not a standard error handler
    return next(error)
  }

  try {
    // invoke function
    const ret = fn(error, req, res, next)

    // wait for returned promise
    if (ret instanceof Promise) {
      ret.catch((error = new Error('Rejected promise')) => next(error))
    }
  } catch (err) {
    next(err)
  }
}

/**
 * Handle the request for the layer.
 *
 * @param {Request} req
 * @param {Response} res
 * @param {function} next
 * @api private
 */

Layer.prototype.handleRequest = function handleRequest (req, res, next) {
  const fn = this.handle

  if (fn.length > 3) {
    // not a standard request handler
    return next()
  }

  try {
    // invoke function
    const ret = fn(req, res, next)

    // wait for returned promise
    if (ret instanceof Promise) {
      ret.catch((error = new Error('Rejected promise')) => next(error))
    }
  } catch (err) {
    next(err)
  }
}

/**
 * Check if this route matches `path`, if so
 * populate `.params`.
 *
 * @param {String} path
 * @return {Boolean}
 * @api private
 */

Layer.prototype.match = function match (path) {
  if (path != null) {
    // fast path non-ending match for / (any path matches)
    if (this.slash) {
      this.params = {}
      this.path = ''
      return true
    }

    for (const matcher of this.matchers) {
      const matched = matcher(path)
      if (matched) {
        // store values
        this.params = matched.params
        this.path = matched.path
        this.keys = Object.keys(matched.params)
        return true
      }
    }
  }

  this.params = undefined
  this.path = undefined
  return false
}

function createRegexMatcher (path) {
  const keys = []
  let name = 0

  for (const m of path.source.matchAll(MATCHING_GROUP_REGEXP)) {
    keys.push({
      name: m[1] || name++,
      offset: m.index
    })
  }

  return function regexpMatcher (p) {
    const match = path.exec(p)
    if (!match) {
      return false
    }

    const params = {}
    for (let i = 1; i < match.length; i++) {
      const key = keys[i - 1]
      const prop = key.name
      const val = decodeParam(match[i])

      if (val !== undefined) {
        params[prop] = val
      }
    }

    return {
      params,
      path: match[0]
    }
  }
}

/**
 * Decode param value.
 *
 * @param {string} val
 * @return {string}
 * @private
 */

function decodeParam (val) {
  if (typeof val !== 'string' || val.length === 0) {
    return val
  }

  try {
    return decodeURIComponent(val)
  } catch (err) {
    if (err instanceof URIError) {
      err.message = `Failed to decode param '${val}'`
      err.status = 400
    }

    throw err
  }
}

/**
 * Loosens the given path for path-to-regexp matching.
 */
function loosen (path) {
  if (path instanceof RegExp || path === '/') {
    return path
  }

  return Array.isArray(path)
    ? path.map(p => loosen(p))
    : String(path).replace(TRAILING_SLASH_REGEXP, '')
}
