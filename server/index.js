const http = require('http')
const {WebSocketServer} = require('ws')
const { ClockVector, konst, Konst, s } = require('json-joy/lib/json-crdt-patch');
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
console.log('Initial Model:', model + '');

const cn = model.api.vec(['columnNames']);
const co = model.api.arr(['columnOrder']);
const rows = model.api.arr(['rows']);
const r0 = (rows.get(0) );

// 1. set the name of the first column
cn.set([[0, konst('type')]]);
// 3. Add age;
cn.set([[1, model.api.builder.val()]])
// set the name of the second column
cn.set([[1,konst('age')]]);
// set the column order with age as index 1
co.ins(1, [konst(1)]);
// 5. Add 'name' column.
cn.set([[2, model.api.builder.val()]])
cn.set([[2,konst('name')]]);
// set the order or the name column to be at index 1
co.ins(1, [konst(2)]);

// 6. Set name=max for the first row
r0.set([[2, konst('max')]])

// 7. Add new row type=cat name=paws, age=15.
rows.ins(1, [model.api.builder.vec()]);
const r1 = (rows.get(1) );
r1.set([[0, konst('cat')],[1, konst(15)],[2, konst('paws')]])

// 8. add a new row after first with type=rat, name=whiskers
rows.ins(1, [model.api.builder.vec()]);
const r2 = (rows.get(1) );
r2.set([[0, konst('rat')],[1, konst(2)],[2, konst('whiskers')]])

const url = require('url')
const uuidv4 = require('uuid').v4

const server = http.createServer()
const wsServer = new WebSocketServer({server})
const port = 8000

const connections = {  }
const users = {  }

const broadcast = () => {
  //Object.keys(connections).forEach(uuid => {
    //const connection = connections[uuid]
    //const message = JSON.stringify(users)
    //connection.send(message)
  //})
}

const handleMessage = (bytes, uuid) => {
  const message = JSON.parse(bytes.toString())
  console.log(`${message.action} recieved at ${message.timestamp} from user ${uuid}`)
  //const message = Model.fromBinary(bytes).fork();
  ///const patch = message.api.flush(message);
  //model.applyPatch(patch);
  //console.log(`model: ${model.toString()} from user ${uuid}`)
  //const user = users[uuid]
  //user.state = message

  //broadcast()

  //console.log(message)
}

const handleClose = uuid => {
  
  console.log( `updated their state:`)
  //delete connections[uuid]
  //delete users[uuid]
  //broadcast()

}

wsServer.on("connection", (connection, request) => {
  // wss:// for encryption or ws://localhost:8000?username=Andy
  const { username } = url.parse(request.url, true).query
  const uuid = uuidv4()
  console.log(`username ${username} : uuid ${uuid}`)
  // broadcast // fan out
  connections[uuid] = connection

  //const blob = model.toBinary()
  //connection.send(blob)
  connection.send(JSON.stringify(model.toBinary()))
  console.log(`Sending data: ${model.toBinary()}`)
  console.log(`Sending data: ${model.toString()}`)

  connection.on("message", message => handleMessage(message, uuid))
  connection.on("close", () => handleClose(uuid))
  connection.on("error", error => {
    console.error(`WebSocket error: ${error}`)
  })

})

server.listen(port, () => {
 console.log(`WebSocket server is running on port ${port}`)
})
