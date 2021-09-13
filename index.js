const {
  where,
  toPullStream,
  toCallback,
  descending,
  paginate,
  startFrom,
  author,
} = require('ssb-db2/operators')
const { reEncrypt } = require('ssb-db2/indexes/private')
const pull = require('pull-stream')
const ref = require('ssb-ref')
const { QL1, QL0 } = require('ssb-subset-ql')

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

  sbot.resolveIndexFeed = function resolveIndexFeed(indexFeedId) {
    // we assume that if we have the feed, that we also have the meta
    // feed this index is a part of

    return pull(
      pull.values([indexFeedId]),
      pull.asyncMap(function validateFeedId(feedId, cb) {
        if (!ref.isFeed(feedId)) {
          cb(new Error('Invalid feed ID: ' + feedId))
        } else {
          cb(null, feedId)
        }
      }),
      pull.asyncMap(function getRootMetafeed(feedId, cb) {
        sbot.metafeeds.findOrCreate(cb)
      }),
      pull.asyncMap(function getIndexesMetafeed(rootMF, cb) {
        sbot.metafeeds.find(rootMF, (f) => f.feedpurpose === 'indexes', cb)
      }),
      pull.asyncMap(function getIndexFeed(indexesMF, cb) {
        if (!indexesMF) return cb(null, null)
        sbot.metafeeds.find(
          indexesMF,
          (f) => f.subfeed === indexFeedId && f.feedpurpose === 'index',
          cb
        )
      }),
      pull.asyncMap(function executeIndexQuery(indexFeed, cb) {
        if (!indexFeed)
          return cb(new Error('Index feed was not found: ' + indexFeedId))
        const { query, querylang } = indexFeed.metadata
        if (!query) {
          return cb(
            new Error(
              'Not a proper index feed: ' +
                indexFeedId +
                ' where metadata: ' +
                JSON.stringify(indexFeed.metadata)
            )
          )
        }
        if (querylang !== 'ssb-ql-0' && querylang !== 'ssb-ql-1') {
          return cb(new Error('Unknown querylang: ' + querylang))
        }

        const matchesQuery =
          querylang === 'ssb-ql-0'
            ? QL0.toOperator(QL0.parse(query), false)
            : QL1.toOperator(QL1.parse(query), false)

        sbot.db.query(
          where(matchesQuery),
          toCallback((err, msgs) => {
            if (err) return cb(err)

            cb(null, new Map(msgs.map((msg) => [msg.key, msg.value])))
          })
        )
      }),
      pull.asyncMap((indexLookup, cb) => {
        sbot.db.query(
          where(author(indexFeedId)),
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

  sbot.getSubset = function getSubset(query, opts) {
    if (!opts) opts = {}
    const querylang = opts.querylang
    if (!querylang) {
      return pull.error(new Error('getSubset() is missing opts.querylang'))
    }
    if (querylang !== 'ssb-ql-0' && querylang !== 'ssb-ql-1') {
      return pull.error(new Error('Unknown querylang: ' + querylang))
    }
    const ql = querylang === 'ssb-ql-0' ? QL0 : QL1
    try {
      ql.validate(query)
    } catch (err) {
      return pull.error(err)
    }
    const parsedQuery = ql.parse(query)
    if (querylang === 'ssb-ql-0' && parsedQuery.private) {
      return pull.error(
        new Error(
          'getSubset does not support private query: ' + JSON.stringify(query)
        )
      )
    }

    return pull(
      sbot.db.query(
        where(ql.toOperator(parsedQuery, false)),
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
