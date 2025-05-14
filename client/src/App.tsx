import React, { useEffect, useRef, useState, useMemo } from 'react'
import throttle from 'lodash.throttle'
import useWebSocket from 'react-use-websocket'
import {ConApi, Model, VecApi} from 'json-joy/lib/json-crdt';
import {ClockVector, konst, Konst, s} from 'json-joy/lib/json-crdt-patch';
import { DataSheetGrid, keyColumn, textColumn } from 'react-datasheet-grid';
import 'react-datasheet-grid/dist/style.css'

function App() {
  //const [ data, setData ] = useState()
  const WS_URL = 'ws://127.0.0.1:8000'
  const { sendJsonMessage, lastJsonMessage } = useWebSocket(WS_URL)

  const THROTTLE = 50
  const sendJsonMessageThrottled = useRef(throttle(sendJsonMessage, THROTTLE))

  //const view = React.useSyncExternalStore(
    //model.api.subscribe,
    //model.api.getSnapshot, [model]);

  //const [grid, setGrid] = useState<{ rows: any[]; columns: any[] }>({ rows: [], columns: [] });
  const [data, setData] = useState<{ id: any; [key: string]: any }[]>([{"id":1}])
  const [prevData, setPrevData] = useState<{ id: any; [key: string]: any }[]>(data)

  const createdRowIds = useMemo(() => new Set(), [])
  const deletedRowIds = useMemo(() => new Set(), [])
  const updatedRowIds = useMemo(() => new Set(), [])

  const cancel = () => {
    setData(prevData)
    createdRowIds.clear()
    deletedRowIds.clear()
    updatedRowIds.clear()
  }

  const commit = () => {
    /* Perform insert, update, and delete to the database here */

    const newData = data.filter(({ id }) => !deletedRowIds.has(id))
    setData(newData)
    setPrevData(newData)

    createdRowIds.clear()
    deletedRowIds.clear()
    updatedRowIds.clear()
  }

  useEffect(() => {
    // Mouse click
    window.addEventListener("mouseup", e => {
      sendJsonMessageThrottled.current({
        action: 'mouseClick',
        timestamp: Date.now()
      });
    });

    // Enter key press handler
    const handleKeyPress = (e) => {
      if (e.key === 'Enter') {
        sendJsonMessage({
          action: 'enterPressed',
          timestamp: Date.now()
        });
      }
    };

    window.addEventListener('keydown', handleKeyPress);

    // Cleanup event listeners
    return () => {
      window.removeEventListener('mouseup', sendJsonMessageThrottled.current);
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, []);

  function genId(): any {
    //// Generate a unique ID for a new row
    return Math.random().toString(36).substr(2, 9);
  }

  if (lastJsonMessage && Object.keys(lastJsonMessage).length > 0) {
    console.log('lastJsonMessage', lastJsonMessage)
    const model = Model.fromBinary(Uint8Array.from(Object.values(lastJsonMessage))).fork();
    //const model = Model.fork(message);
    // const patch = message.api.flush(message);
    // message.applyPatch(patch);
    console.log('message', model)
    const { columnNames, columnOrder } = model.api.getSnapshot();
    const rowsServer = []
    //setData({ columnNames, columnOrder, rows });
    console.log('columnNames', columnNames)
    console.log('columnOrder', columnOrder)
    console.log('rows', rowsServer)

    function gridFromModel(model: Model) {
      const { columnNames, columnOrder, rows } = model.api.getSnapshot();
      const rowCols = rows.map(row =>
        columnOrder.reduce((acc, colId) => {
          acc[columnNames[colId]] = row[colId];
          return acc;
        }, {} as Record<string, any>
      )
    );
      return { columnNames, columnOrder, rows: rowCols };
    }
    // const rowCols = rowsServer.map(row =>
    //   columnOrder.reduce((acc, colId) => {
    //     acc[columnNames[colId]] = row[colId];
    //     return acc;
    //   }, {} as Record<string, any>)
    // );
    const rowCols = gridFromModel(model);
    console.log('rowCols', rowCols);

    const displayCols = columnOrder.map(colId => ({
      ...keyColumn(columnNames[colId], textColumn),
      title: columnNames[colId],
    }));
    console.log('displayCols', displayCols);

    const cn = model.api.vec(['columnNames']);
    const co = model.api.arr(['columnOrder']);
    const rows = model.api.arr(['rows']);
    const r0 = (rows.get(0) as VecApi<any>);
    
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
    const r1 = rows.get(1) as VecApi<any>;
    r1.set([[0, konst('cat')],[1, konst(15)],[2, konst('paws')]])
    
    // 8. add a new row after first with type=rat, name=whiskers
    rows.ins(1, [model.api.builder.vec()]);
    const r2 = (rows.get(1) as VecApi<any>);
    r2.set([[0, konst('rat')],[1, konst(2)],[2, konst('whiskers')]])

    console.log('model', model.view());

    return (
      <>
      <h1>Server Data</h1>
      <div>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
        <tr>
          {columnOrder.map((colId) => (
          <th key={colId} style={{ border: '1px solid #ddd', padding: '8px', textAlign: 'left' }}>
            {columnNames[colId]}
          </th>
          ))}
        </tr>
        </thead>
        <tbody>
        {rowsServer.map((row, rowIndex) => (
          <tr key={rowIndex}>
          {columnOrder.map((colId) => (
            <td key={`${rowIndex}-${colId}`} style={{ border: '1px solid #ddd', padding: '8px' }}>
            {row[colId]}
            </td>
          ))}
          </tr>
        ))}
        </tbody>
      </table>
      </div>
      <h1>Client Grid</h1>
      <div>
        <button onClick={commit}>
          Commit
        </button>
        <button onClick={cancel}>
          Cancel
        </button>
        <DataSheetGrid
          //value={[{'a':1}]}
          //columns={[{...keyColumn('a', textColumn), title: 'A'}]}
          //value={rowCols}
          value={data}
          columns={displayCols}
          createRow={() => ({ id: genId() })}
          duplicateRow={({ rowData }) => ({ ...rowData, id: genId() })}
          rowClassName={({ rowData }) => {
            if (deletedRowIds.has(rowData.id)) {
              return 'row-deleted'
            }
            if (createdRowIds.has(rowData.id)) {
              return 'row-created'
            }
            if (updatedRowIds.has(rowData.id)) {
              return 'row-updated'
            }
          }}
          onChange={(newValue, operations) => {
            for (const operation of operations) {
              if (operation.type === 'CREATE') {
                newValue
                  .slice(operation.fromRowIndex, operation.toRowIndex)
                  .forEach(({ id }) => createdRowIds.add(id))
              }

              if (operation.type === 'UPDATE') {
                newValue
                  .slice(operation.fromRowIndex, operation.toRowIndex)
                  .forEach(({ id }) => {
                    if (!createdRowIds.has(id) && !deletedRowIds.has(id)) {
                      updatedRowIds.add(id)
                    }
                  })
              }

              if (operation.type === 'DELETE') {
                let keptRows = 0

                data
                  .slice(operation.fromRowIndex, operation.toRowIndex)
                  .forEach(({ id }, i) => {
                    updatedRowIds.delete(id)

                    if (createdRowIds.has(id)) {
                      createdRowIds.delete(id)
                    } else {
                      deletedRowIds.add(id)
                      newValue.splice(
                        operation.fromRowIndex + keptRows++,
                        0,
                        data[operation.fromRowIndex + i]
                      )
                    }
                  })
              }
            }

            setData(newValue)
          }}
        />
      </div>
      </>
    );
}
    return <h1>Waiting for data...</h1>;
}

export default App
