const ssbKeys = require('ssb-keys')
const path = require('path')
const test = require('tape')
const pull = require('pull-stream')
const rimraf = require('rimraf')
const mkdirp = require('mkdirp')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')
const validate = require('ssb-validate')

const mfKeys = require('ssb-meta-feeds/keys')
const metafeed = require('ssb-meta-feeds/metafeed')

const dir = '/tmp/ssb-get-index-feed'

rimraf.sync(dir)
mkdirp.sync(dir)

const keys = ssbKeys.loadOrCreateSync(path.join(dir, 'secret'))

const sbot = SecretStack({ appKey: caps.shs })
  .use(require('ssb-db2'))
  .use(require('../'))
  .call(null, {
    keys,
    path: dir,
  })

test('Base', (t) => {
  const feedid = ssbKeys.generate().id
  const msg1 = { type: 'contact', contact: feedid, following: true }
  const msg2 = { type: 'vote', vote: { value: 1, link: '%abc' } }
  const msg3 = { type: 'post', text: 'c' }

  const seed_hex = '4e2ce5ca70cd12cc0cee0a5285b61fbc3b5f4042287858e613f9a8bf98a70d39'
  const seed = Buffer.from(seed_hex, 'hex')

  const mfKey = mfKeys.deriveFeedKeyFromSeed(seed, 'ssb-meta-feeds-v1:metafeed')
  const indexKey = mfKeys.deriveFeedKeyFromSeed(seed, 'ssb-meta-feeds-v1:metafeed/index')

  const mfMsg1 = metafeed.add('classic', 'main', keys, mfKey)
  const mfMsg2 = metafeed.add('classic', 'index', indexKey, mfKey, {
    query: JSON.stringify({
      op: 'and',
      data: [
        { op: 'type', data: 'contact' },
        { op: 'author', data: sbot.id}
      ]
    })
  })

  // we probably need an easy way in db2 to write these messages as a different id
  let state = validate.initial()
  state = validate.appendNew(state, null, mfKey, mfMsg1, Date.now())
  state = validate.appendNew(state, null, mfKey, mfMsg2, Date.now())
  
  sbot.db.publish(msg1, (err, indexMsg) => {
    const indexMsg1 = { type: 'metafeed/index', indexed: indexMsg.key }
    state = validate.appendNew(state, null, indexKey, indexMsg1, Date.now())
    
    pull(
      pull.values([msg2, msg3]),
      pull.asyncMap((msg, cb) => sbot.db.publish(msg, cb)),
      pull.collect((err) => {
        t.error(err)

        pull(
          pull.values(state.queue),
          pull.asyncMap((kv, cb) => sbot.db.add(kv.value, cb)),
          pull.collect((err) => {

            t.error(err)
            sbot.db.onDrain(() => {
              pull(
                sbot.getIndexFeed(indexKey.id),
                pull.collect((err, results) => {
                  t.error(err)
                  t.equal(results.length, 1, "correct number of results")
                  t.equal(results[0].msg.content.type, 'metafeed/index', "correct index msg")
                  t.equal(results[0].indexed.content.type, 'contact', "correct msg")
                  sbot.close(t.end)
                })
              )
            })
          })
        )
      })
    )
  })
})
