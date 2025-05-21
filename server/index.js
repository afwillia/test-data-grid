const http = require('http')
const {WebSocketServer} = require('ws')
const { ClockVector, konst, Konst, s, Patch } = require('json-joy/lib/json-crdt-patch');
const {encode, decode} = require('json-joy/lib/json-crdt-patch/codec/compact');
const { Model, VecApi } = require('json-joy/lib/json-crdt');

const schema = s.obj({
  doc_version: s.con('0.0.2'),
  columnNames: s.vec(s.con('')),
  columnOrder: s.arr([s.con(0)]),
  rows: s.arr([s.vec(s.con(''))])
});

const replicaId = 0x10000;
// Create a new JSON CRDT document.
const model = Model.create(schema, replicaId);
console.log('Initial Model:', model.view());

const url = require('url');
const { monitorEventLoopDelay } = require('perf_hooks');
const uuidv4 = require('uuid').v4

const server = http.createServer()
const wsServer = new WebSocketServer({server})
const port = 8000

const connections = {  }
const users = {  }

const broadcast = (model) => {
  try {
    const patch = model.api.flush()
    if (!patch.ops.length) {
      console.log('no patch to broadcast')
      return
    }
    console.log('broadcasting patch: ', patch)
    const message = encode(patch)
    console.log(`broadcasting ${message}`)
    console.log('from model: ', model.api.getSnapshot())
    Object.keys(connections).forEach(uuid => {
      const connection = connections[uuid]
      //const message = JSON.stringify(model.toBinary())
      connection.send(JSON.stringify(message))
    })
  } catch (e) {
    console.error('Error applying patch: ', e)
  }
}

const broadcastPatch = (patchMsg) => {
  console.log('received patch: ', patchMsg)
  const patch = decode(JSON.parse(patchMsg))
  console.log('decoded patch: ', patch)
  Object.keys(connections).forEach(uuid => {
    const connection = connections[uuid]
    connection.send(JSON.stringify(encode(patch)))
  })
  console.log('broadcasted patch')
  return
}

const handleMessage = (bytes, model, uuid) => {
  console.log(`bytes: ${bytes}`)
  let newPatch;
  try {
    const patch = decode(JSON.parse(bytes))
    console.log(`patch: ${patch}`)
    model.applyPatch(patch);
    const newPatch = model.api.flush()
    console.log(`new patch: ${newPatch}`)
  } catch (e) {
    console.error('Error applying patch: ', e)
    return model
  }
  console.log('model snapshot: ', model.api.getSnapshot())
  //broadcast(model)
  broadcastPatch(bytes)
  return model
}

const handleClose = uuid => {
  console.log( `${users[uuid].username} updated their state:`)
  delete connections[uuid]
  //delete users[uuid]
  //broadcast()
}

wsServer.on("connection", (connection, request) => {
  // wss:// for encryption or ws://localhost:8000?username=Andy
  //const { username } = url.parse(request.url, true).query
  const userCount = Object.keys(connections).length + 1
  const username = "User " + userCount
  const uuid = uuidv4()
  //console.log(`username ${username} : uuid ${uuid}`)
  // broadcast // fan out
  connections[uuid] = connection
  users[uuid] = { username, uuid }

  //const blob = model.toBinary()
  //connection.send(blob)
  connection.send(JSON.stringify(model.toBinary()))
  //console.log(`Sending data: ${model.toBinary()}`)
  console.log(`Sending data: ${model.view()}`)

  connection.on("message", message => {
    const newPatch = handleMessage(message, model, uuid)
    console.log('newPatch: ', model.api.flush())
    if (newPatch) {
      //model.applyPatch(newPatch)
      console.log('model after apply: ', model.api.getSnapshot())
    }
  })
  connection.on("close", () => handleClose(uuid))
  connection.on("error", error => {
    console.error(`WebSocket error: ${error}`)
  })

})

server.listen(port, () => {
 console.log(`WebSocket server is running on port ${port}`)
})
