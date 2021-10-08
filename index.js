// SPDX-FileCopyrightText: 2021 Anders Rune Jensen
//
// SPDX-License-Identifier: LGPL-3.0-only

const {
  where,
  toPullStream,
  descending,
  paginate,
  startFrom,
} = require('ssb-db2/operators')
const { reEncrypt } = require('ssb-db2/indexes/private')
const pull = require('pull-stream')
const { QL1, QL0 } = require('ssb-subset-ql')

exports.manifest = {
  getSubset: 'source',
}

exports.permissions = {
  anonymous: { allow: ['getSubset'], deny: null },
}

exports.init = function (sbot, config) {
  if (!sbot.db || !sbot.db.query) {
    throw new Error('ssb-subset-rpc requires ssb-db2')
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
      pull.map((msg) => reEncrypt(msg).value)
    )
  }

  return {}
}
