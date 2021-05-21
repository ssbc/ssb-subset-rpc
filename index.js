const { where, toPullStream, toCallback, descending, paginate, startFrom,
        and, or, type, author, isPrivate, isPublic } = require('ssb-db2/operators')
const { reEncrypt } = require('ssb-db2/indexes/private')
const pull = require('pull-stream')

exports.manifest = {
  getSubset: 'source',
  getIndexFeed: 'source'
}

exports.permissions = {
  anonymous: { allow: ['getSubset', 'getIndexFeed'], deny: null },
}

exports.init = function (sbot, config) {
  function formatMsg(msg) {
    msg = reEncrypt(msg)
    return msg.value
  }

  const noDataOps = ['isPrivate', 'isPublic']

  function parseQuery(o) {
    if (!o.op) throw "missing op"
    if (!noDataOps.includes(o.op) && !o.data) throw "missing data for " + o.op

    if (o.op == 'and') {
      if (!Array.isArray(o.data))
        throw "data part of 'and' op must be an array"

      let args = o.data.map(op => parseQuery(op))
      return and(...args)
    } else if (o.op == 'or') {
      if (!Array.isArray(o.data))
        throw "data part of 'and' op must be an array"

      let args = o.data.map(op => parseQuery(op))
      return or(...args)
    } else if (o.op == 'type') {
      if (!typeof(o.data) === 'string')
        throw "data part of 'type' op must be a string"
      return type(o.data)
    } else if (o.op == 'author') {
      if (!typeof(o.data) === 'string')
        throw "data part of 'author' op must be a string"
      return author(o.data)
    }
    else if (o.op == 'isPublic')
      return isPublic()
    else if (o.op == 'isPrivate')
      return isPrivate()
    else
      throw "Unknown op " + o.op
  }

  sbot.getIndexFeed = function getIndexFeed(feedId) {
    // we assume that if we have the feed, that we also have the meta
    // feed this index is a part of

    return pull(
      pull.values([feedId]),
      pull.asyncMap((feedId, cb) => {
        sbot.metafeeds.query.getMetadata(feedId, cb)
      }),
      pull.asyncMap((content, cb) => {
        const indexQuery = parseQuery(JSON.parse(content.query))

        sbot.db.query(
          where(indexQuery),
          toCallback((err, indexedResults) => {
            if (err) return cb(err)

            cb(null, new Map(indexedResults.map(i => [i.key, i.value])))
          })
        )
      }),
      pull.asyncMap((indexLookup, cb) => {
        sbot.db.query(
          where(author(feedId)),
          toCallback((err, indexResults) => {
            if (err) return cb(err)

            cb(null, indexResults.map(i => {
              return {
                msg: formatMsg(i),
                indexed: indexLookup.get(i.value.content.indexed)
              }
            }))
          })
        )
      }),
      pull.flatten()
    )
  }

  sbot.getSubset = function getSubset(queryObj, opts) {
    if (!opts) opts = {}

    const query = parseQuery(queryObj)

    return pull(
      sbot.db.query(
        where(query),
        opts.descending ? descending() : null,
        opts.startFrom ? startFrom(opts.startFrom) : null,
        opts.pageSize ? paginate(opts.pageSize) : null,
        toPullStream()
      ),
      opts.pageSize ? pull.take(1) : null,
      opts.pageSize ? pull.flatten() : null,
      pull.map(msg => formatMsg(msg))
    )
  }

  return {}
}
