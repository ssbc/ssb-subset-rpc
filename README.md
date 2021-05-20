# SSB get subset

Subset replication RPC for SSB.

Example:

```js
pull(
  sbot.getSubset({
    op: 'and',
    data: [
      { op: 'type', data: 'post' },
      { op: 'author', data: '@abc' }
    ]
  }),
  pull.collect((err, results) => {
    console.logs("posts for @abc", results)
  })
)
```

