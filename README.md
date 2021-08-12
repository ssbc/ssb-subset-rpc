# SSB meta feeds RPC

A secret stack plugin adding meta feeds subset replication related
RPCs.

Requires the
[ssb-meta-feeds](https://github.com/ssb-ngi-pointer/ssb-meta-feeds)
module loaded as a secret stack plugin.

Implements the
[spec](https://github.com/ssb-ngi-pointer/ssb-subset-replication-spec)

# API

## getSubset

examples:

```js
pull(
  sbot.getSubset({
    op: 'and',
    args: [
      { op: 'type', string: 'post' },
      { op: 'author', feed: '@6CAxOI3f+LUOVrbAl0IemqiS7ATpQvr9Mdw9LC4+Uv0=.ed25519' }
    ]
  }),
  pull.collect((err, results) => {
    console.logs("posts for arj", results)
  })
)

pull(
  sbot.getSubset({
    op: 'and',
    args: [
      { op: 'type', string: 'post' },
      { op: 'author', feed: '@6CAxOI3f+LUOVrbAl0IemqiS7ATpQvr9Mdw9LC4+Uv0=.ed25519' }
    ]
  }, {
    descending: true,
    pageSize: 10
  }),
  pull.collect((err, results) => {
    console.logs("latest 10 posts for arj", results)
  })
)
```

## resolveIndexFeed


```js
pull(
  sbot.resolveIndexFeed(indexFeedId),
  pull.collect((err, results) => {
    console.logs("index feed and the indexed messages", results)
    // [{ msg: indexMsg, indexed: contactMsg }, ...]
  })
)
```
