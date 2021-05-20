# SSB get subset

Subset replication RPC for SSB.

Example:

```js
pull(
  sbot.getSubset({
    op: 'and',
    data: [
      { op: 'type', data: 'post' },
      { op: 'author', data: '@6CAxOI3f+LUOVrbAl0IemqiS7ATpQvr9Mdw9LC4+Uv0=.ed25519' }
    ]
  }),
  pull.collect((err, results) => {
    console.logs("posts for arj", results)
  })
)

pull(
  sbot.getSubset({
    op: 'and',
    data: [
      { op: 'type', data: 'post' },
      { op: 'author', data: '@6CAxOI3f+LUOVrbAl0IemqiS7ATpQvr9Mdw9LC4+Uv0=.ed25519' }
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

