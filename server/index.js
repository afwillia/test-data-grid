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

// const cn = model.api.vec(['columnNames']);
// const co = model.api.arr(['columnOrder']);
// const rows = model.api.arr(['rows']);
// const r0 = (rows.get(0) );

// // 1. set the name of the first column
// cn.set([[0, konst('type')]]);
// // 3. Add age;
// cn.set([[1, model.api.builder.val()]])
// // set the name of the second column
// cn.set([[1,konst('age')]]);
// // set the column order with age as index 1
// co.ins(1, [konst(1)]);
// // 5. Add 'name' column.
// cn.set([[2, model.api.builder.val()]])
// cn.set([[2,konst('name')]]);
// // set the order or the name column to be at index 1
// co.ins(1, [konst(2)]);

// // 6. Set name=max for the first row
// r0.set([[2, konst('max')]])

// // 7. Add new row type=cat name=paws, age=15.
// rows.ins(1, [model.api.builder.vec()]);
// const r1 = (rows.get(1) );
// r1.set([[0, konst('cat')],[1, konst(15)],[2, konst('paws')]])

// // 8. add a new row after first with type=rat, name=whiskers
// rows.ins(1, [model.api.builder.vec()]);
// const r2 = (rows.get(1) );
// r2.set([[0, konst('rat')],[1, konst(2)],[2, konst('whiskers')]])

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

const handleMessage = (bytes, model, uuid) => {
  //console.log(`model: ${model.toString()}`)
  console.log(`bytes: ${bytes}`)
  let newPatch;
  //const patch = Patch.fromBinary(Uint8Array.from(Object.values(JSON.parse(bytes))));
  try {
    //const patch = Patch(decode(bytes))
    // console.log(`json: ${JSON.parse(bytes)}`)
    // console.log('u8a: ', Uint8Array.from(Object.values(JSON.parse(bytes))))
    // console.log('decoded: ', decode(Uint8Array.from(Object.values(JSON.parse(bytes)))))
    // console.log('dec', decode(JSON.parse(bytes)))
    const patch = decode(JSON.parse(bytes))
    //const patch = Patch.fromBinary(Uint8Array.from(Object.values(JSON.parse(bytes))));
    //const pb = patch.toBinary();
    //const pb = Patch.fromBinary(patch);
    console.log(`patch: ${patch}`)
    model.applyPatch(patch);
    const newPatch = model.api.flush()
    console.log(`new patch: ${newPatch}`)
  } catch (e) {
    console.error('Error applying patch: ', e)
    return model
  }
  //console.log(`${message.action} received at ${message.timestamp} from user ${uuid}`)
  //model.api.applyPatch(message.api, message);
  //console.log(`model: ${model.toString()} from user`)
  //connection.send(JSON.stringify(model.toBinary()))
  //const message = Model.fromBinary(bytes).fork();
  ///const patch = message.api.flush(message);
  //model.applyPatch(patch);
  //console.log(`model: ${model.toString()} from user ${users[uuid].username}`)
  console.log('model snapshot: ', model.api.getSnapshot())
  //console.log('model view: ', model.view())
  //const user = users[uuid]
  //user.state = message

  broadcast(model)
  return model

  //console.log(message)
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
