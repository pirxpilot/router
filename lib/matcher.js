const MATCHING_GROUP_REGEXP = /\((?:\?<(.*?)>)?(?!\?)/g;

export default function matcher(path, { sensitive = false, end = true, strict = false } = {}) {
  return path instanceof RegExp
    ? createRegexMatcher(path)
    : createURLPatternMatcher(path, {
        sensitive,
        end,
        strict
      });
}

export function createRegexMatcher(path) {
  const regexKeys = [];
  let name = 0;

  for (const m of path.source.matchAll(MATCHING_GROUP_REGEXP)) {
    regexKeys.push({
      name: m[1] || name++,
      offset: m.index
    });
  }

  return function regexpMatcher(p) {
    const match = path.exec(p);
    if (!match) {
      return false;
    }

    const params = {};
    const keys = [];
    for (let i = 1; i < match.length; i++) {
      const { name } = regexKeys[i - 1];
      const val = decodeParam(match[i]);

      if (val !== undefined) {
        keys.push(name);
        params[name] = val;
      }
    }

    return {
      params,
      keys,
      path: match[0]
    };
  };
}

export function createURLPatternMatcher(pathname, { sensitive, end, strict }) {
  // Build the pattern:
  // - For end=false (prefix matching): add {/*}? to match optional trailing content
  // - For end=true with trailing=true: add {/}? to match optional trailing slash

  if (!end) {
    if (pathname.endsWith('/')) pathname = pathname.slice(0, -1);
    pathname += '{/*}?';
  } else if (!strict) {
    if (pathname.endsWith('/')) pathname = pathname.slice(0, -1);
    pathname += '{/}?';
  }

  const pattern = new URLPattern({ pathname }, { ignoreCase: !sensitive });

  return function urlPatternMatcher(p) {
    const match = pattern.exec(p);
    if (!match) {
      return false;
    }

    const params = {};
    const keys = [];
    for (const [key, value] of Object.entries(match.pathname.groups)) {
      // Skip the default wildcard capture group '0'
      if (key === '0') continue;
      if (value !== undefined) {
        keys.push(key);
        params[key] = decodeParam(value);
      }
    }

    // For prefix matching, calculate the matched path length
    let matchedPath = match.pathname.input;
    if (!end) {
      // Remove the wildcard matched portion to get just the prefix
      const wildcardMatch = match.pathname.groups['0'];
      if (wildcardMatch !== undefined && wildcardMatch !== '') {
        // The wildcard captures content after the /, so we need to remove "/" + wildcard
        matchedPath = matchedPath.slice(0, -(wildcardMatch.length + 1));
      } else if (wildcardMatch === '') {
        // Empty string means we matched a trailing slash: /foo/ with pattern /foo{/*}?
        // Remove the trailing slash to normalize
        matchedPath = matchedPath.slice(0, -1);
      }
    }

    return {
      params,
      keys,
      path: matchedPath
    };
  };
}

/**
 * Decode param value.
 *
 * @param {string} val
 * @return {string}
 * @private
 */

export function decodeParam(val) {
  if (typeof val !== 'string' || val.length === 0) {
    return val;
  }

  try {
    return decodeURIComponent(val);
  } catch (err) {
    if (err instanceof URIError) {
      err.message = `Failed to decode param '${val}'`;
      err.status = 400;
    }

    throw err;
  }
}
