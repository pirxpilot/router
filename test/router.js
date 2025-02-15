const { it, describe } = require('node:test')
const assert = require('node:assert/strict')

const { METHODS } = require('node:http')
const Router = require('..')
const utils = require('./support/utils')

const methods = METHODS.map(m => m.toLowerCase())
const createHitHandle = utils.createHitHandle
const createServer = utils.createServer
const rawrequest = utils.rawrequest
const request = utils.request
const shouldHaveBody = utils.shouldHaveBody
const shouldHitHandle = utils.shouldHitHandle
const shouldNotHaveBody = utils.shouldNotHaveBody
const shouldNotHitHandle = utils.shouldNotHitHandle

describe('Router', function () {
  it('should return a function', function () {
    assert.equal(typeof Router(), 'function')
  })

  it('should return a function using new', function () {
    assert.equal(typeof (new Router()), 'function')
  })

  it('should reject missing callback', function () {
    const router = new Router()
    assert.throws(function () { router({}, {}) }, /argument callback is required/)
  })

  it('should invoke callback without "req.url"', function (_, done) {
    const router = new Router()
    router.use(saw)
    router({}, {}, done)
  })

  describe('.all(path, fn)', function () {
    it('should be chainable', function () {
      const router = new Router()
      assert.equal(router.all('/', helloWorld), router)
    })

    it('should respond to all methods', async function () {
      const router = new Router()
      const server = createServer(router)
      router.all('/', helloWorld)

      for (const method of methods) {
        if (method === 'connect') {
          // CONNECT is tricky and supertest doesn't support it
          continue
        }
        if (method === 'query' && process.version.startsWith('v21')) {
          continue
        }

        const body = method !== 'head'
          ? shouldHaveBody(Buffer.from('hello, world'))
          : shouldNotHaveBody()

        await request(server)[method]('/')
          .expect(200)
          .expect(body)
      }
    })

    it('should support array of paths', async function () {
      const router = new Router()
      const server = createServer(router)

      router.all(['/foo', '/bar'], saw)

      await request(server).get('/').expect(404)
      await request(server).get('/foo').expect(200, 'saw GET /foo')
      await request(server).get('/bar').expect(200, 'saw GET /bar')
    })

    it('should support regexp path', async function () {
      const router = new Router()
      const server = createServer(router)

      router.all(/^\/[a-z]oo$/, saw)

      await request(server).get('/').expect(404)
      await request(server).get('/foo').expect(200, 'saw GET /foo')
      await request(server).get('/zoo').expect(200, 'saw GET /zoo')
    })

    it('should support parameterized path', async function () {
      const router = new Router()
      const server = createServer(router)

      router.all('/:thing', saw)

      await request(server).get('/').expect(404)
      await request(server).get('/foo').expect(200, 'saw GET /foo')
      await request(server).get('/bar').expect(200, 'saw GET /bar')
      await request(server).get('/foo/bar').expect(404)
    })

    it('should not stack overflow with many registered routes', function (_, done) {
      // long-running test

      const router = new Router()
      const server = createServer(router)

      for (let i = 0; i < 6000; i++) {
        router.get('/thing' + i, helloWorld)
      }

      router.get('/', helloWorld)

      request(server)
        .get('/')
        .expect(200, 'hello, world', done)
    })

    it('should not stack overflow with a large sync stack', function (_, done) {
      // long-running test

      const router = new Router()
      const server = createServer(router)

      for (let i = 0; i < 6000; i++) {
        router.get('/foo', function (req, res, next) { next() })
      }

      router.get('/foo', helloWorld)

      request(server)
        .get('/foo')
        .expect(200, 'hello, world', done)
    })

    describe('with "caseSensitive" option', function () {
      it('should not match paths case-sensitively by default', async function () {
        const router = new Router()
        const server = createServer(router)

        router.all('/foo/bar', saw)

        await request(server)
          .get('/foo/bar')
          .expect(200, 'saw GET /foo/bar')
        await request(server)
          .get('/FOO/bar')
          .expect(200, 'saw GET /FOO/bar')
        await request(server)
          .get('/FOO/BAR')
          .expect(200, 'saw GET /FOO/BAR')
      })

      it('should not match paths case-sensitively when false', async function () {
        const router = new Router({ caseSensitive: false })
        const server = createServer(router)

        router.all('/foo/bar', saw)

        await request(server)
          .get('/foo/bar')
          .expect(200, 'saw GET /foo/bar')
        await request(server)
          .get('/FOO/bar')
          .expect(200, 'saw GET /FOO/bar')
        await request(server)
          .get('/FOO/BAR')
          .expect(200, 'saw GET /FOO/BAR')
      })

      it('should match paths case-sensitively when true', async function () {
        const router = new Router({ caseSensitive: true })
        const server = createServer(router)

        router.all('/foo/bar', saw)

        await request(server)
          .get('/foo/bar')
          .expect(200, 'saw GET /foo/bar')
        await request(server)
          .get('/FOO/bar')
          .expect(404)
        await request(server)
          .get('/FOO/BAR')
          .expect(404)
      })
    })

    describe('with "strict" option', function () {
      it('should accept optional trailing slashes by default', async function () {
        const router = new Router()
        const server = createServer(router)

        router.all('/foo', saw)

        await request(server)
          .get('/foo')
          .expect(200, 'saw GET /foo')
        await request(server)
          .get('/foo/')
          .expect(200, 'saw GET /foo/')
      })

      it('should accept optional trailing slashes when false', async function () {
        const router = new Router({ strict: false })
        const server = createServer(router)

        router.all('/foo', saw)

        await request(server)
          .get('/foo')
          .expect(200, 'saw GET /foo')
        await request(server)
          .get('/foo/')
          .expect(200, 'saw GET /foo/')
      })

      it('should not accept optional trailing slashes when true', async function () {
        const router = new Router({ strict: true })
        const server = createServer(router)

        router.all('/foo', saw)

        await request(server)
          .get('/foo')
          .expect(200, 'saw GET /foo')
        await request(server)
          .get('/foo/')
          .expect(404)
      })
    })
  })

  methods.slice().sort().forEach(function (method) {
    if (method === 'connect') {
      // CONNECT is tricky and supertest doesn't support it
      return
    }
    if (method === 'query' && process.version.startsWith('v21')) {
      return
    }

    const body = method !== 'head'
      ? shouldHaveBody(Buffer.from('hello, world'))
      : shouldNotHaveBody()

    describe('.' + method + '(path, ...fn)', function () {
      it('should be chainable', function () {
        const router = new Router()
        assert.equal(router[method]('/', helloWorld), router)
      })

      it('should respond to a ' + method.toUpperCase() + ' request', function (_, done) {
        const router = new Router()
        const server = createServer(router)

        router[method]('/', helloWorld)

        request(server)[method]('/')
          .expect(200)
          .expect(body)
          .end(done)
      })

      it('should reject invalid fn', function () {
        const router = new Router()
        assert.throws(router[method].bind(router, '/', 2), /argument handler must be a function/)
      })

      it('should support array of paths', async function () {
        const router = new Router()
        const server = createServer(router)

        router[method](['/foo', '/bar'], createHitHandle(1), helloWorld)

        await request(server)[method]('/')
          .expect(404)
          .expect(shouldNotHitHandle(1))
        await request(server)[method]('/foo')
          .expect(200)
          .expect(shouldHitHandle(1))
          .expect(body)
        await request(server)[method]('/bar')
          .expect(200)
          .expect(shouldHitHandle(1))
          .expect(body)
      })

      it('should support parameterized path', async function () {
        const router = new Router()
        const server = createServer(router)

        router[method]('/:thing', createHitHandle(1), helloWorld)

        await request(server)[method]('/')
          .expect(404)
          .expect(shouldNotHitHandle(1))
        await request(server)[method]('/foo')
          .expect(200)
          .expect(shouldHitHandle(1))
          .expect(body)
        await request(server)[method]('/bar')
          .expect(200)
          .expect(shouldHitHandle(1))
          .expect(body)
        await request(server)[method]('/foo/bar')
          .expect(404)
          .expect(shouldNotHitHandle(1))
      })

      it('should accept multiple arguments', function (_, done) {
        const router = new Router()
        const server = createServer(router)

        router[method]('/', createHitHandle(1), createHitHandle(2), helloWorld)

        request(server)[method]('/')
          .expect(200)
          .expect(shouldHitHandle(1))
          .expect(shouldHitHandle(2))
          .expect(body)
          .end(done)
      })

      describe('req.baseUrl', function () {
        it('should be empty', function (_, done) {
          const router = new Router()
          const server = createServer(router)

          router[method]('/foo', function handle (req, res) {
            res.setHeader('x-url-base', JSON.stringify(req.baseUrl))
            res.end()
          })

          request(server)[method]('/foo')
            .expect('x-url-base', '""')
            .expect(200, done)
        })
      })

      describe('req.route', function () {
        it('should be a Route', function (_, done) {
          const router = new Router()
          const server = createServer(router)

          router[method]('/foo', function handle (req, res) {
            res.setHeader('x-is-route', String(req.route instanceof Router.Route))
            res.end()
          })

          request(server)[method]('/foo')
            .expect('x-is-route', 'true')
            .expect(200, done)
        })

        it('should be the matched route', function (_, done) {
          const router = new Router()
          const server = createServer(router)

          router[method]('/foo', function handle (req, res) {
            res.setHeader('x-is-route', String(req.route.path === '/foo'))
            res.end()
          })

          request(server)[method]('/foo')
            .expect('x-is-route', 'true')
            .expect(200, done)
        })
      })
    })
  })

  describe('.use(...fn)', function () {
    it('should reject missing functions', function () {
      const router = new Router()
      assert.throws(router.use.bind(router), /argument handler is required/)
    })

    it('should reject empty array', function () {
      const router = new Router()
      assert.throws(router.use.bind(router, []), /argument handler is required/)
    })

    it('should reject non-functions', function () {
      const router = new Router()
      assert.throws(router.use.bind(router, '/', 'hello'), /argument handler must be a function/)
      assert.throws(router.use.bind(router, '/', 5), /argument handler must be a function/)
      assert.throws(router.use.bind(router, '/', null), /argument handler must be a function/)
      assert.throws(router.use.bind(router, '/', new Date()), /argument handler must be a function/)
    })

    it('should be chainable', function () {
      const router = new Router()
      assert.equal(router.use(helloWorld), router)
    })

    it('should invoke function for all requests', async function () {
      const router = new Router()
      const server = createServer(router)

      router.use(saw)

      await request(server).get('/').expect(200, 'saw GET /')
      await request(server).put('/').expect(200, 'saw PUT /')
      await request(server).post('/foo').expect(200, 'saw POST /foo')
      await rawrequest(server).options('*').expect(200, 'saw OPTIONS *')
    })

    it('should not invoke for blank URLs', async function () {
      const router = new Router()
      const server = createServer(function hander (req, res, next) {
        req.url = ''
        router(req, res, next)
      })

      router.use(saw)

      await request(server).get('/').expect(404)
    })

    it('should support another router', async function () {
      const inner = new Router()
      const router = new Router()
      const server = createServer(router)

      inner.use(saw)
      router.use(inner)

      await request(server).get('/').expect(200, 'saw GET /')
    })

    it('should accept multiple arguments', async function () {
      const router = new Router()
      const server = createServer(router)

      router.use(createHitHandle(1), createHitHandle(2), helloWorld)

      await request(server).get('/')
        .expect(shouldHitHandle(1))
        .expect(shouldHitHandle(2))
        .expect(200, 'hello, world')
    })

    it('should accept single array of middleware', async function () {
      const router = new Router()
      const server = createServer(router)

      router.use([createHitHandle(1), createHitHandle(2), helloWorld])

      await request(server).get('/')
        .expect(shouldHitHandle(1))
        .expect(shouldHitHandle(2))
        .expect(200, 'hello, world')
    })

    it('should accept nested arrays of middleware', async function () {
      const router = new Router()
      const server = createServer(router)

      router.use([[createHitHandle(1), createHitHandle(2)], createHitHandle(3)], helloWorld)

      await request(server).get('/')
        .expect(shouldHitHandle(1))
        .expect(shouldHitHandle(2))
        .expect(shouldHitHandle(3))
        .expect(200, 'hello, world')
    })

    it('should not invoke singular error function', function (_, done) {
      const router = new Router()
      const server = createServer(router)

      router.use(function handleError (err, req, res, next) {
        throw err || new Error('boom!')
      })

      request(server)
        .get('/')
        .expect(404, done)
    })

    it('should not stack overflow with a large sync stack', function (_, done) {
      // long-running test

      const router = new Router()
      const server = createServer(router)

      for (let i = 0; i < 6000; i++) {
        router.use(function (req, res, next) { next() })
      }

      router.use(helloWorld)

      request(server)
        .get('/')
        .expect(200, 'hello, world', done)
    })

    describe('error handling', function () {
      it('should invoke error function after next(err)', function (_, done) {
        const router = new Router()
        const server = createServer(router)

        router.use(function handle (req, res, next) {
          next(new Error('boom!'))
        })

        router.use(sawError)

        request(server)
          .get('/')
          .expect(200, 'saw Error: boom!', done)
      })

      it('should invoke error function after throw err', function (_, done) {
        const router = new Router()
        const server = createServer(router)

        router.use(function handle (req, res, next) {
          throw new Error('boom!')
        })

        router.use(sawError)

        request(server)
          .get('/')
          .expect(200, 'saw Error: boom!', done)
      })

      it('should not invoke error functions above function', function (_, done) {
        const router = new Router()
        const server = createServer(router)

        router.use(sawError)

        router.use(function handle (req, res, next) {
          throw new Error('boom!')
        })

        request(server)
          .get('/')
          .expect(500, done)
      })
    })

    describe('next("route")', function () {
      it('should invoke next handler', function (_, done) {
        const router = new Router()
        const server = createServer(router)

        router.use(function handle (req, res, next) {
          res.setHeader('x-next', 'route')
          next('route')
        })

        router.use(saw)

        request(server)
          .get('/')
          .expect('x-next', 'route')
          .expect(200, 'saw GET /', done)
      })

      it('should invoke next function', function (_, done) {
        const router = new Router()
        const server = createServer(router)

        function goNext (req, res, next) {
          res.setHeader('x-next', 'route')
          next('route')
        }

        router.use(createHitHandle(1), goNext, createHitHandle(2), saw)

        request(server)
          .get('/')
          .expect(shouldHitHandle(1))
          .expect('x-next', 'route')
          .expect(shouldHitHandle(2))
          .expect(200, 'saw GET /', done)
      })

      it('should not invoke error handlers', function (_, done) {
        const router = new Router()
        const server = createServer(router)

        router.use(function handle (req, res, next) {
          res.setHeader('x-next', 'route')
          next('route')
        })

        router.use(sawError)

        request(server)
          .get('/')
          .expect('x-next', 'route')
          .expect(404, done)
      })
    })

    describe('next("router")', function () {
      it('should exit the router', function (_, done) {
        const router = new Router()
        const server = createServer(router)

        function handle (req, res, next) {
          res.setHeader('x-next', 'router')
          next('router')
        }

        router.use(handle, createHitHandle(1))
        router.use(saw)

        request(server)
          .get('/')
          .expect('x-next', 'router')
          .expect(shouldNotHitHandle(1))
          .expect(404, done)
      })

      it('should not invoke error handlers', function (_, done) {
        const router = new Router()
        const server = createServer(router)

        router.use(function handle (req, res, next) {
          res.setHeader('x-next', 'router')
          next('route')
        })

        router.use(sawError)

        request(server)
          .get('/')
          .expect('x-next', 'router')
          .expect(404, done)
      })
    })

    describe('promise support', function () {
      it('should pass rejected promise value', function (_, done) {
        const router = new Router()
        const server = createServer(router)

        router.use(function createError (req, res, next) {
          return Promise.reject(new Error('boom!'))
        })

        router.use(sawError)

        request(server)
          .get('/')
          .expect(200, 'saw Error: boom!', done)
      })

      it('should pass rejected promise without value', function (_, done) {
        const router = new Router()
        const server = createServer(router)

        router.use(function createError (req, res, next) {
          return Promise.reject() // eslint-disable-line prefer-promise-reject-errors
        })

        router.use(sawError)

        request(server)
          .get('/')
          .expect(200, 'saw Error: Rejected promise', done)
      })

      it('should ignore resolved promise', function (_, done) {
        const router = new Router()
        const server = createServer(router)

        router.use(function createError (req, res, next) {
          saw(req, res)
          return Promise.resolve('foo')
        })

        router.use(function () {
          done(new Error('Unexpected middleware invoke'))
        })

        request(server)
          .get('/foo')
          .expect(200, 'saw GET /foo', done)
      })

      describe('error handling', function () {
        it('should pass rejected promise value', function (_, done) {
          const router = new Router()
          const server = createServer(router)

          router.use(function createError (req, res, next) {
            return Promise.reject(new Error('boom!'))
          })

          router.use(function handleError (err, req, res, next) {
            return Promise.reject(new Error('caught: ' + err.message))
          })

          router.use(sawError)

          request(server)
            .get('/')
            .expect(200, 'saw Error: caught: boom!', done)
        })

        it('should pass rejected promise without value', function (_, done) {
          const router = new Router()
          const server = createServer(router)

          router.use(function createError (req, res, next) {
            return Promise.reject() // eslint-disable-line prefer-promise-reject-errors
          })

          router.use(function handleError (err, req, res, next) {
            return Promise.reject(new Error('caught: ' + err.message))
          })

          router.use(sawError)

          request(server)
            .get('/')
            .expect(200, 'saw Error: caught: Rejected promise', done)
        })

        it('should ignore resolved promise', function (_, done) {
          const router = new Router()
          const server = createServer(router)

          router.use(function createError (req, res, next) {
            return Promise.reject(new Error('boom!'))
          })

          router.use(function handleError (err, req, res, next) {
            sawError(err, req, res, next)
            return Promise.resolve('foo')
          })

          router.use(function () {
            done(new Error('Unexpected middleware invoke'))
          })

          request(server)
            .get('/foo')
            .expect(200, 'saw Error: boom!', done)
        })
      })
    })

    describe('req.baseUrl', function () {
      it('should be empty', function (_, done) {
        const router = new Router()
        const server = createServer(router)

        router.use(sawBase)

        request(server)
          .get('/foo/bar')
          .expect(200, 'saw ', done)
      })
    })
  })

  describe('.use(path, ...fn)', function () {
    it('should be chainable', function () {
      const router = new Router()
      assert.equal(router.use('/', helloWorld), router)
    })

    it('should invoke when req.url starts with path', async function () {
      const router = new Router()
      const server = createServer(router)

      router.use('/foo', saw)
      await request(server)
        .get('/')
        .expect(404)
      await request(server)
        .post('/foo')
        .expect(200, 'saw POST /')
      await request(server)
        .post('/foo/bar')
        .expect(200, 'saw POST /bar')
    })

    it('should match if path has trailing slash', async function () {
      const router = new Router()
      const server = createServer(router)

      router.use('/foo/', saw)

      await request(server)
        .get('/')
        .expect(404)
      await request(server)
        .post('/foo')
        .expect(200, 'saw POST /')
      await request(server)
        .post('/foo/bar')
        .expect(200, 'saw POST /bar')
    })

    it('should support array of paths', async function () {
      const router = new Router()
      const server = createServer(router)

      router.use(['/foo/', '/bar'], saw)

      await request(server)
        .get('/')
        .expect(404)
      await request(server)
        .get('/foo')
        .expect(200, 'saw GET /')
      await request(server)
        .get('/bar')
        .expect(200, 'saw GET /')
    })

    it('should support regexp path', async function () {
      const router = new Router()
      const server = createServer(router)

      router.use(/^\/[a-z]oo$/, saw)

      await request(server)
        .get('/')
        .expect(404)
      await request(server)
        .get('/foo')
        .expect(200, 'saw GET /')
      await request(server)
        .get('/fooo')
        .expect(404)
      await request(server)
        .get('/zoo/bear')
        .expect(404)
      await request(server)
        .get('/get/zoo')
        .expect(404)
    })

    it('should support regexp path with params', async function () {
      const router = new Router()
      const server = createServer(router)

      router.use(/^\/([a-z]oo)$/, function (req, res, next) {
        createHitHandle(req.params[0])(req, res, next)
      }, saw)

      router.use(/^\/([a-z]oo)\/(?<animal>bear)$/, function (req, res, next) {
        createHitHandle(req.params[0] + req.params.animal)(req, res, next)
      }, saw)

      await request(server)
        .get('/')
        .expect(404)
      await request(server)
        .get('/foo')
        .expect(shouldHitHandle('foo'))
        .expect(200, 'saw GET /')
      await request(server)
        .get('/zoo')
        .expect(shouldHitHandle('zoo'))
        .expect(200, 'saw GET /')
      await request(server)
        .get('/fooo')
        .expect(404)
      await request(server)
        .get('/zoo/bear')
        .expect(shouldHitHandle('zoobear'))
        .expect(200)
      await request(server)
        .get('/get/zoo')
        .expect(404)
    })

    it('should ensure regexp matches path prefix', function (_, done) {
      const router = new Router()
      const server = createServer(router)

      router.use(/\/api.*/, createHitHandle(1))
      router.use(/api/, createHitHandle(2))
      router.use(/\/test/, createHitHandle(3))
      router.use(helloWorld)

      request(server)
        .get('/test/api/1234')
        .expect(shouldNotHitHandle(1))
        .expect(shouldNotHitHandle(2))
        .expect(shouldHitHandle(3))
        .expect(200, done)
    })

    it('should support parameterized path', async function () {
      const router = new Router()
      const server = createServer(router)

      router.use('/:thing', saw)

      await request(server)
        .get('/')
        .expect(404)
      await request(server)
        .get('/foo')
        .expect(200, 'saw GET /')
      await request(server)
        .get('/bar')
        .expect(200, 'saw GET /')
      await request(server)
        .get('/foo/bar')
        .expect(200, 'saw GET /bar')
    })

    it('should accept multiple arguments', function (_, done) {
      const router = new Router()
      const server = createServer(router)

      router.use('/foo', createHitHandle(1), createHitHandle(2), helloWorld)

      request(server)
        .get('/foo')
        .expect(shouldHitHandle(1))
        .expect(shouldHitHandle(2))
        .expect(200, 'hello, world', done)
    })

    describe('with "caseSensitive" option', function () {
      it('should not match paths case-sensitively by default', async function () {
        const router = new Router()
        const server = createServer(router)

        router.use('/foo', saw)

        await request(server)
          .get('/foo/bar')
          .expect(200, 'saw GET /bar')
        await request(server)
          .get('/FOO/bar')
          .expect(200, 'saw GET /bar')
        await request(server)
          .get('/FOO/BAR')
          .expect(200, 'saw GET /BAR')
      })

      it('should not match paths case-sensitively when false', async function () {
        const router = new Router({ caseSensitive: false })
        const server = createServer(router)

        router.use('/foo', saw)

        await request(server)
          .get('/foo/bar')
          .expect(200, 'saw GET /bar')
        await request(server)
          .get('/FOO/bar')
          .expect(200, 'saw GET /bar')
        await request(server)
          .get('/FOO/BAR')
          .expect(200, 'saw GET /BAR')
      })

      it('should match paths case-sensitively when true', async function () {
        const router = new Router({ caseSensitive: true })
        const server = createServer(router)

        router.use('/foo', saw)

        await request(server)
          .get('/foo/bar')
          .expect(200, 'saw GET /bar')
        await request(server)
          .get('/FOO/bar')
          .expect(404)
        await request(server)
          .get('/FOO/BAR')
          .expect(404)
      })
    })

    describe('with "strict" option', function () {
      it('should accept optional trailing slashes by default', async function () {
        const router = new Router()
        const server = createServer(router)

        router.use('/foo', saw)

        await request(server)
          .get('/foo')
          .expect(200, 'saw GET /')
        await request(server)
          .get('/foo/')
          .expect(200, 'saw GET /')
      })

      it('should accept optional trailing slashes when false', async function () {
        const router = new Router({ strict: false })
        const server = createServer(router)

        router.use('/foo', saw)

        await request(server)
          .get('/foo')
          .expect(200, 'saw GET /')
        await request(server)
          .get('/foo/')
          .expect(200, 'saw GET /')
      })

      it('should accept optional trailing slashes when true', async function () {
        const router = new Router({ strict: true })
        const server = createServer(router)

        router.use('/foo', saw)

        await request(server)
          .get('/foo')
          .expect(200, 'saw GET /')
        await request(server)
          .get('/foo/')
          .expect(200, 'saw GET /')
      })
    })

    describe('next("route")', function () {
      it('should invoke next handler', function (_, done) {
        const router = new Router()
        const server = createServer(router)

        router.use('/foo', function handle (req, res, next) {
          res.setHeader('x-next', 'route')
          next('route')
        })

        router.use('/foo', saw)

        request(server)
          .get('/foo')
          .expect('x-next', 'route')
          .expect(200, 'saw GET /', done)
      })

      it('should invoke next function', function (_, done) {
        const router = new Router()
        const server = createServer(router)

        function goNext (req, res, next) {
          res.setHeader('x-next', 'route')
          next('route')
        }

        router.use('/foo', createHitHandle(1), goNext, createHitHandle(2), saw)

        request(server)
          .get('/foo')
          .expect(shouldHitHandle(1))
          .expect('x-next', 'route')
          .expect(shouldHitHandle(2))
          .expect(200, 'saw GET /', done)
      })
    })

    describe('req.baseUrl', function () {
      it('should contain the stripped path', function (_, done) {
        const router = new Router()
        const server = createServer(router)

        router.use('/foo', sawBase)

        request(server)
          .get('/foo/bar')
          .expect(200, 'saw /foo', done)
      })

      it('should contain the stripped path for multiple levels', function (_, done) {
        const router1 = new Router()
        const router2 = new Router()
        const server = createServer(router1)

        router1.use('/foo', router2)
        router2.use('/bar', sawBase)

        request(server)
          .get('/foo/bar/baz')
          .expect(200, 'saw /foo/bar', done)
      })

      it('should contain the stripped path for multiple levels with regular expressions', function (_, done) {
        const router1 = new Router()
        const router2 = new Router()
        const server = createServer(router1)

        router1.use(/^\/foo/, router2)
        router2.use(/^\/bar/, sawBase)

        request(server)
          .get('/foo/bar/baz')
          .expect(200, 'saw /foo/bar', done)
      })

      it('should be altered correctly', function (_, done) {
        const router = new Router()
        const server = createServer(router)
        const sub1 = new Router()
        const sub2 = new Router()
        const sub3 = new Router()

        sub3.get('/zed', setsawBase(1))

        sub2.use('/baz', sub3)

        sub1.use('/', setsawBase(2))

        sub1.use('/bar', sub2)
        sub1.use('/bar', setsawBase(3))

        router.use(setsawBase(4))
        router.use('/foo', sub1)
        router.use(setsawBase(5))
        router.use(helloWorld)

        request(server)
          .get('/foo/bar/baz/zed')
          .expect('x-saw-base-1', '/foo/bar/baz')
          .expect('x-saw-base-2', '/foo')
          .expect('x-saw-base-3', '/foo/bar')
          .expect('x-saw-base-4', '')
          .expect('x-saw-base-5', '')
          .expect(200, done)
      })
    })

    describe('req.url', function () {
      it('should strip path from req.url', function (_, done) {
        const router = new Router()
        const server = createServer(router)

        router.use('/foo', saw)

        request(server)
          .get('/foo/bar')
          .expect(200, 'saw GET /bar', done)
      })

      it('should restore req.url after stripping', function (_, done) {
        const router = new Router()
        const server = createServer(router)

        router.use('/foo', setsaw(1))
        router.use(saw)

        request(server)
          .get('/foo/bar')
          .expect('x-saw-1', 'GET /bar')
          .expect(200, 'saw GET /foo/bar', done)
      })

      it('should strip/restore with trailing stash', function (_, done) {
        const router = new Router()
        const server = createServer(router)

        router.use('/foo', setsaw(1))
        router.use(saw)

        request(server)
          .get('/foo/')
          .expect('x-saw-1', 'GET /')
          .expect(200, 'saw GET /foo/', done)
      })
    })
  })

  describe('request rewriting', function () {
    it('should support altering req.method', function (_, done) {
      const router = new Router()
      const server = createServer(router)

      router.put('/foo', createHitHandle(1))
      router.post('/foo', createHitHandle(2), function (req, res, next) {
        req.method = 'PUT'
        next()
      })

      router.post('/foo', createHitHandle(3))
      router.put('/foo', createHitHandle(4))
      router.use(saw)

      request(server)
        .post('/foo')
        .expect(shouldNotHitHandle(1))
        .expect(shouldHitHandle(2))
        .expect(shouldNotHitHandle(3))
        .expect(shouldHitHandle(4))
        .expect(200, 'saw PUT /foo', done)
    })

    it('should support altering req.url', function (_, done) {
      const router = new Router()
      const server = createServer(router)

      router.get('/bar', createHitHandle(1))
      router.get('/foo', createHitHandle(2), function (req, res, next) {
        req.url = '/bar'
        next()
      })

      router.get('/foo', createHitHandle(3))
      router.get('/bar', createHitHandle(4))
      router.use(saw)

      request(server)
        .get('/foo')
        .expect(shouldNotHitHandle(1))
        .expect(shouldHitHandle(2))
        .expect(shouldNotHitHandle(3))
        .expect(shouldHitHandle(4))
        .expect(200, 'saw GET /bar', done)
    })
  })
})

function helloWorld (req, res) {
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/plain')
  res.end('hello, world')
}

function setsaw (num) {
  const name = 'x-saw-' + String(num)
  return function saw (req, res, next) {
    res.setHeader(name, req.method + ' ' + req.url)
    next()
  }
}

function setsawBase (num) {
  const name = 'x-saw-base-' + String(num)
  return function sawBase (req, res, next) {
    res.setHeader(name, String(req.baseUrl))
    next()
  }
}

function saw (req, res) {
  const msg = 'saw ' + req.method + ' ' + req.url
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/plain')
  res.end(msg)
}

function sawError (err, req, res, next) {
  const msg = 'saw ' + err.name + ': ' + err.message
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/plain')
  res.end(msg)
}

function sawBase (req, res) {
  const msg = 'saw ' + req.baseUrl
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/plain')
  res.end(msg)
}
