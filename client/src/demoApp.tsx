import { useEffect, useSyncExternalStore, useRef, useMemo, useState } from "react";
import useWebSocket from "react-use-websocket";
import { Model, VecApi, ClockVector } from 'json-joy/lib/json-crdt';
import {encode, decode} from 'json-joy/lib/json-crdt-patch/codec/compact';
import { Patch, konst } from 'json-joy/lib/json-crdt-patch';
import throttle from 'lodash.throttle';
import { Column, DataSheetGrid, keyColumn, textColumn } from 'react-datasheet-grid';
import 'react-datasheet-grid/dist/style.css'
import './dataGridExtra.css'

// Set a session ID for forking the model
const sessionId = Math.floor(Math.random() * 1000000);

function processMessage(binaryData) {
    try {
        const model = Model.fromBinary(binaryData);
        console.log('Model successfully created:', model);
        return model;
    } catch (e) {
        console.error('Error processing message:', e);
    }
}

function App() {
    // Create reactive values for rows and columns
    const [gridRows, setGridRows] = useState<Record<string, any>[]>([{ id: 0, colOne: 'A'}]);
    const [gridColumns, setGridColumns] = useState<Column[]>([{...keyColumn('colOne', textColumn), title: 'colOne'}]);
    const [prevRows, setPrevRows] = useState(gridRows)

    // when the app loads, create a new model from the server
    const WS_URL = 'ws://localhost:8000'
    const { sendJsonMessage, lastJsonMessage } = useWebSocket(WS_URL, {
        onOpen: () => console.log('WebSocket connection opened'),
        onClose: () => console.log('WebSocket connection closed'),
        onError: (event) => console.error('WebSocket error:', event),
        onMessage: (event) => {
            console.log('Raw event data type:', typeof event.data);
            let message;
    
            // Handle different potential WebSocket data formats
            if (event.data instanceof Blob) {
                // Convert Blob to ArrayBuffer first
                const reader = new FileReader();
                reader.onload = () => {
                    message = new Uint8Array(reader.result as ArrayBuffer);
                    processMessage(message);
                };
                reader.readAsArrayBuffer(event.data);
                return;
            } else if (typeof event.data === 'string') {
                // Handle string data
                try {
                    const parsed = JSON.parse(event.data);
                    message = new Uint8Array(Object.values(parsed));
                } catch (e) {
                    console.error('Failed to parse string data:', e);
                    return;
                }
            } else {
                // Assume it's already binary
                message = new Uint8Array(event.data);
            }
            
            const model = processMessage(message);
            console.log('Received message:', message);
            console.log('Updated model:', model.toString());
        },
        shouldReconnect: (closeEvent) => {
            console.log('WebSocket closed. Reconnecting...', closeEvent)
            return true
        },
        reconnectAttempts: 5,
        reconnectInterval: 1000,
    })

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
