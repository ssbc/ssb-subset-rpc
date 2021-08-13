const ssbKeys = require('ssb-keys')
const path = require('path')
const test = require('tape')
const pull = require('pull-stream')
const rimraf = require('rimraf')
const mkdirp = require('mkdirp')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')
const pify = require('util').promisify

const sleep = pify(setTimeout)
const dir = '/tmp/ssb-get-index-feed-ql0'

rimraf.sync(dir)
mkdirp.sync(dir)

const keys = ssbKeys.loadOrCreateSync(path.join(dir, 'secret'))

const sbot = SecretStack({ appKey: caps.shs })
  .use(require('ssb-db2'))
  .use(require('ssb-meta-feeds'))
  .use(require('ssb-index-feed-writer'))
  .use(require('../'))
  .call(null, {
    keys,
    path: dir,
  })

test('resolveIndexFeed() QL0 Base', async (t) => {
  const feedid = ssbKeys.generate().id
  const msg1 = { type: 'contact', contact: feedid, following: true }
  const msg2 = { type: 'vote', vote: { value: 1, link: '%abc' } }
  const msg3 = { type: 'post', text: 'c' }

  await pify(sbot.db.publish)(msg1)
  await pify(sbot.db.publish)(msg2)
  await pify(sbot.db.publish)(msg3)

  const indexFeed = await pify(sbot.indexFeedWriter.start)({
    type: 'contact',
    author: sbot.id,
  })

  await sleep(500)

  await new Promise((resolve) => {
    pull(
      sbot.resolveIndexFeed(indexFeed.keys.id),
      pull.collect((err, results) => {
        t.error(err)
        t.equal(results.length, 1, 'correct number of results')
        t.equal(
          results[0].msg.content.type,
          'metafeed/index',
          'correct index msg'
        )
        t.equal(results[0].indexed.content.type, 'contact', 'correct msg')
        resolve()
      })
    )
  })

  t.end()
})

test('resolveIndexFeed() QL0 Error cases', (t) => {
  pull(
    sbot.resolveIndexFeed(sbot.id),
    pull.collect((err, results) => {
      t.match(err.message, /Index feed was not found/, 'err')
      t.equal(results.length, 0, 'zero results')

      pull(
        sbot.resolveIndexFeed(
          '@randoIzFW+BvLV246CW05g6jLkTvLilp7IW+9irQkfU=.ed25519'
        ),
        pull.collect((err, results) => {
          t.match(err.message, /Index feed was not found/, 'err')
          t.equal(results.length, 0, 'zero results')

          sbot.close(t.end)
        })
      )
    })
  )
})
