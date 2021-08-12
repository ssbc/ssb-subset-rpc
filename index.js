const {
  where,
  toPullStream,
  toCallback,
  descending,
  paginate,
  startFrom,
  and,
  or,
  type,
  author,
} = require('ssb-db2/operators')
const { reEncrypt } = require('ssb-db2/indexes/private')
const pull = require('pull-stream')
const ref = require('ssb-ref')

exports.manifest = {
  getSubset: 'source',
  resolveIndexFeed: 'source',
}

exports.permissions = {
  anonymous: { allow: ['getSubset', 'resolveIndexFeed'], deny: null },
}

exports.init = function (sbot, config) {
  function formatMsg(msg) {
    msg = reEncrypt(msg)
    return msg.value
  }

  function parseQuery(o) {
    if (!o.op) throw 'missing op'

    if (o.op == 'and') {
      if (!Array.isArray(o.args)) throw "args part of 'and' op must be an array"

      let args = o.args.map((op) => parseQuery(op))
      return and(...args)
    } else if (o.op == 'or') {
      if (!Array.isArray(o.args)) throw "args part of 'and' op must be an array"

      let args = o.args.map((op) => parseQuery(op))
      return or(...args)
    } else if (o.op == 'type') {
      if (typeof o.string !== 'string')
        throw "'type' must have an string option"
      return type(o.string)
    } else if (o.op == 'author') {
      if (typeof o.feed !== 'string') throw "'author' must have an feed option"
      return author(o.feed)
    } else throw 'Unknown op ' + o.op
  }

  sbot.resolveIndexFeed = function resolveIndexFeed(feedId) {
    // we assume that if we have the feed, that we also have the meta
    // feed this index is a part of

    return pull(
      pull.values([feedId]),
      pull.asyncMap((feedId, cb) => {
        if (!ref.isFeed(feedId)) return cb('invalid feed id')

        sbot.metafeeds.query.getMetadata(feedId, cb)
      }),
      pull.asyncMap((content, cb) => {
        if (!content || content.feedpurpose !== 'index' || !content.query)
          return cb('not a proper index feed')

        const indexQuery = parseQuery(JSON.parse(content.query))

        sbot.db.query(
          where(indexQuery),
          toCallback((err, indexedResults) => {
            if (err) return cb(err)

            cb(null, new Map(indexedResults.map((i) => [i.key, i.value])))
          })
        )
      }),
      pull.asyncMap((indexLookup, cb) => {
        sbot.db.query(
          where(author(feedId)),
          toCallback((err, indexResults) => {
            if (err) return cb(err)

            cb(
              null,
              indexResults.map((i) => {
                return {
                  msg: formatMsg(i),
                  indexed: indexLookup.get(i.value.content.indexed),
                }
              })
            )
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
      pull.map((msg) => formatMsg(msg))
    )
  }

  return {}
}
