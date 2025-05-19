import { useEffect, useSyncExternalStore, useRef, useMemo, useState } from "react";
import useWebSocket from "react-use-websocket";
import { Model, VecApi, ClockVector } from 'json-joy/lib/json-crdt';
import {encode, decode} from 'json-joy/lib/json-crdt-patch/codec/compact';
import { Patch, konst } from 'json-joy/lib/json-crdt-patch';
import throttle from 'lodash.throttle';
import { DataSheetGrid, keyColumn, textColumn } from 'react-datasheet-grid';
import 'react-datasheet-grid/dist/style.css'
import './dataGridExtra.css'

// Set a session ID for forking the model
const sessionId = Math.floor(Math.random() * 1000000);

function App() {
    // Create reactive values for rows and columns
    const [gridRows, setGridRows] = useState<any[]>([{ id: 0, colOne: 'A'}]);
    const [gridColumns, setGridColumns] = useState<any[]>([{...keyColumn('colOne', textColumn), title: 'colOne'}]);
    const [prevRows, setPrevRows] = useState(gridRows)

    const createdRowIds = useMemo(() => new Set(), [])
    const deletedRowIds = useMemo(() => new Set(), [])
    const updatedRowIds = useMemo(() => new Set(), [])

    const cancel = () => {
        setGridRows(prevRows)
        createdRowIds.clear()
        deletedRowIds.clear()
        updatedRowIds.clear()
    }

    const commit = () => {
        /* Perform insert, update, and delete to the database here */
        const newData = gridRows.filter(({ id }) => !deletedRowIds.has(id))
        setGridRows(newData)
        setPrevRows(newData)

        createdRowIds.clear()
        deletedRowIds.clear()
        updatedRowIds.clear()
    }

    function genId() {
        const existingIds = new Set(gridRows.map(row => Number(row.id)));
        let nextId = 0;
        while (existingIds.has(nextId)) {
            nextId++;
        }
        return nextId;
    }

    return (
        <div>
            <h1>JSON CRDT Grid Demo</h1>
            <div>
                <button onClick={commit}>
                    Commit
                </button>

                <button onClick={cancel}>
                    Cancel
                </button>
                <DataSheetGrid
                    value={gridRows}
                    columns={gridColumns}
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
                    createRow={() => ({ id: genId() })}
                    duplicateRow={({ rowData }) => ({ ...rowData, id: genId() })}
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

                            gridRows
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
                                    gridRows[operation.fromRowIndex + i]
                                )
                                }
                            })
                        }
                        }

                        setGridRows(newValue)
      }}
                />
            </div>
        </div>
    )
}

export default App;
