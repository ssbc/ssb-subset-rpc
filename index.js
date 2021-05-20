const { where, toPullStream, descending, paginate, startFrom,
        and, or, type, author, isPrivate, isPublic } = require('ssb-db2/operators')
const { reEncrypt } = require('ssb-db2/indexes/private')
const pull = require('pull-stream')

exports.manifest = {
  getSubset: 'source',
}

exports.permissions = {
  anonymous: { allow: ['getSubset'], deny: null },
}

exports.init = function (sbot, config) {
  function formatMsg(msg) {
    msg = reEncrypt(msg)
    return msg.value
  }

  sbot.getSubset = function getSubset(queryObj, opts) {
    if (!opts) opts = {}
    
    const noDataOps = ['isPrivate', 'isPublic']
    
    function parse(o) {
      if (!o.op) throw "missing op"
      if (!noDataOps.includes(o.op) && !o.data) throw "missing data for " + o.op

      if (o.op == 'and') {
        if (!Array.isArray(o.data))
          throw "data part of 'and' op must be an array"
        
        let args = o.data.map(op => parse(op))
        return and(...args)
      } else if (o.op == 'or') {
        if (!Array.isArray(o.data))
          throw "data part of 'and' op must be an array"

        let args = o.data.map(op => parse(op))
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

    const query = parse(queryObj)

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
