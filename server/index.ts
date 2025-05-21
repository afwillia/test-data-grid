import http from 'http';
import {WebSocketServer} from 'ws';
import {ConApi, Model, VecApi} from 'json-joy/lib/json-crdt';
import {ClockVector, konst, Konst, s} from 'json-joy/lib/json-crdt-patch';

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
const r0 = (rows.get(0) as VecApi);

// 1. set the name of the first column
cn.set([[0, konst('type')]]);
cn.set([[1, model.api.builder.val()]])
cn.set([[2, model.api.builder.val()]])

import url from 'url'
import { v4 as uuidv4 } from 'uuid'

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
  //const message = JSON.parse(bytes.toString())
  //const message = Model.fromBinary(bytes).fork();
  ///const patch = message.api.flush(message);
  //model.applyPatch(patch);
  console.log(`model: ${model.toString()} from user ${uuid}`)
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
