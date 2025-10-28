[![NPM Version][npm-image]][npm-url]
[![Build Status][build-image]][build-url]

# @pirxpilot/router

This is a simplified fork of [router] with some dependencies removed.

## Router Options

The router accepts an options object that can be used to customize its behavior:

```js
const router = Router({
  caseSensitive: false,    // Enable case-sensitive routing
  mergeParams: false,      // Preserve req.params values from parent router
  strict: false           // Enable strict routing
})
```

Available options:

- `caseSensitive` - Enable case-sensitive routing. By default routes are case-insensitive (e.g., "/foo" and "/FOO" are treated the same).
- `mergeParams` - Preserve the `req.params` values from the parent router. If the parent and the child have conflicting param names, the child's value take precedence.
- `strict` - Enable strict routing. By default "/foo" and "/foo/" are treated the same by the router.

## Pattern Matching with URLPattern API

This router uses the [URLPattern API] for path matching.

### Basic Pattern Examples

- Named parameters:
```js
router.get('/user/:id', (req, res) => { ... })         // matches /user/123, /user/abc
```

- Optional parameters:
```js
router.get('/user/:name?', (req, res) => { ... })      // matches /user, /user/john
```

- Wildcard/Greedy matching:
```js
router.get('/files/:path*', (req, res) => { ... })     // matches /files, /files/docs, /files/docs/intro.pdf
```

### Advanced Pattern Examples

- Custom parameter patterns:
```js
router.get('/user/:id(\\d+)', (req, res) => { ... })   // matches /user/123 but not /user/abc
```

- Multiple parameters:
```js
router.get('/api/:version/:resource', (req, res) => { ... })  // matches /api/v1/users
```

- Group matching:
```js
router.get('/:category(books|movies)/:id', (req, res) => { ... })  // matches /books/123 or /movies/456
```

## License

[MIT](LICENSE)

[router]: https://github.com/pillarjs/router
[URLPattern API]: https://developer.mozilla.org/en-US/docs/Web/API/URLPattern
[npm-image]: https://img.shields.io/npm/v/@pirxpilot/router
[npm-url]: https://npmjs.org/package/@pirxpilot/router
[build-image]: https://img.shields.io/github/actions/workflow/status/pirxpilot/router/check.yaml?branch=main
[build-url]: https://github.com/pirxpilot/router/actions/workflows/check.yaml
