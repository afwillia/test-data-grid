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

function gridToModel(gridRows, model) {
    const rows = gridRows.map(row => {
        const { id, ...rest } = row;
        return { id: Number(id), ...rest };
    });
    const columnNames = Object.keys(gridRows[0] || {});
    const columnOrder = columnNames.map(name => ({ name }));
    console.log('rows:', rows);
    console.log('columnNames:', columnNames);
    console.log('columnOrder:', columnOrder);
    //return { rows, columnNames, columnOrder };
    const cn = model.api.vec(['columnNames']);
    const co = model.api.arr(['columnOrder']);
    const rowsArr = model.api.arr(['rows']);
    //const r0 = (rowsArr.get(0) as VecApi<any>);
    //r0.set([[0, konst('edited value')]])
    // Apply row changes
    // First, update existing rows
    console.log(gridRows,'gr')
    const minLength = Math.min(rows.length, gridRows.length);
    for (let i = 0; i < minLength; i++) {
        const rowVec = rowsArr.get(i) as VecApi<any>;
        const editedRow = gridRows[i];
        // Update each cell in the row
        Object.entries(editedRow).forEach(([key, value]) => {
            const columnIndex = 0; // fix this later - lookup column index
            console.log('columnIndex:', columnIndex);
            if (!isNaN(columnIndex)) {
                rowVec.set([[columnIndex, konst(value)]]);
            }
        });
    }
    console.log('model Snapshot:', model.api.getSnapshot());
    return model
}

function App() {
    // Create reactive values for rows and columns
    const [gridRows, setGridRows] = useState<Record<string, any>[]>([{ colOne: 'loaded value'}]);
    const [gridColumns, setGridColumns] = useState<Column[]>([
        //{...keyColumn('id', textColumn), title: 'id'},
        {...keyColumn('colOne', textColumn), title: 'colOne'}
    ]);
    const [prevRows, setPrevRows] = useState(gridRows)
    const modelRef = useRef<Model | null>(null);
    const getModel = () => modelRef.current;
    const setModel = (newModel: any) => {
        modelRef.current = newModel;
    };
    const isFirstMessageRef = useRef(true);
    const [snapshot, setSnapshot] = useState<any>({rows: [], columnNames: [], columnOrder: []});

    function processMessage(binaryData) {
    if (isFirstMessageRef) {
        try {
            const model = Model.fromBinary(binaryData).fork(sessionId);
            console.log('Model successfully created:', model);
            return model;
        } catch (e) {
            console.error('Error processing message:', e);
        }
    } else {
        if (!modelRef.current) return;
            
        const patchData = Uint8Array.from(Object.values(binaryData));
        try {
            const patch = Patch.fromBinary(patchData);
            setModel(modelRef.current.applyPatch(patch));
            console.log("Applied patch to model");
        } catch (error) {
            console.error("Error applying patch:", error);
        }
    }
}

    // when the app loads, create a new model from the server
    const WS_URL = 'ws://localhost:8000'
    const { sendJsonMessage } = useWebSocket(WS_URL, {
        onOpen: () => console.log('WebSocket connection opened'),
        onClose: () => console.log('WebSocket connection closed'),
        onError: (event) => console.error('WebSocket error:', event),
        onMessage: (event) => {
            console.log('Raw event data type:', typeof event.data);
            let message;
            let model;
    
            // Handle different potential WebSocket data formats
            if (event.data instanceof Blob) {
                console.log('input blob')
                // Convert Blob to ArrayBuffer first
                const reader = new FileReader();
                reader.onload = () => {
                    message = new Uint8Array(reader.result as ArrayBuffer);
                    const model = processMessage(message);
                };
                reader.readAsArrayBuffer(event.data);
                return model;
            } else if (typeof event.data === 'string') {
                // Handle string data
                try {
                    if (isFirstMessageRef.current) {
                        const parsed = JSON.parse(event.data);
                        message = new Uint8Array(Object.values(parsed));
                        model = Model.fromBinary(message).fork(sessionId);
                        setModel(model);
                    } else {
                        const parsed = JSON.parse(event.data);
                        try {
                            const patchData = decode(parsed);
                            const patch = Patch.fromBinary(patchData);
                            setModel(modelRef.current?.applyPatch(patch));
                        } catch (e) {
                            console.error('Failed to parse patch data:', e);
                        }
                    }
                    console.log('input string')
                    console.log(event.data)
                    
                } catch (e) {
                    console.error('Failed to parse string data:', e);
                    return;
                }
            } else {
                // Assume it's already binary
                message = new Uint8Array(event.data);
            }
            
            setModel(processMessage(message));
            console.log('model', model)
            console.log('message', message)
            setSnapshot(getModel()?.api.getSnapshot());
            console.log('Received message:', message);
            console.log('Updated model:', getModel()?.toString());
            console.log('Snapshot:', snapshot ? snapshot : 'unloaded');
            isFirstMessageRef.current = false;
        },
        shouldReconnect: (closeEvent) => {
            console.log('WebSocket closed. Reconnecting...', closeEvent)
            return true
        },
        reconnectAttempts: 5,
        reconnectInterval: 1000,
    })

    const THROTTLE = 50;
    const sendJsonMessageThrottled = useRef(throttle(sendJsonMessage, THROTTLE));
    const sendThrottledJsonMessage = (message: any) => {
        sendJsonMessageThrottled.current(message);
    };

    const [modelRows, setModelRows] = useState<[]>(snapshot.rows || {})
    const [modelColumnNames, setModelColumnNames] = useState<[]>(snapshot.columnNames || {})
    const [modelColumnOrder, setModelColumnOrder] = useState<[]>(snapshot.columnOrder || {})

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
        setModel(gridToModel(newData, getModel()))
        const patch = getModel()?.api.flush()
        const binaryData = patch?.toBinary();
        console.log('Binary data:', patch);
        sendThrottledJsonMessage(binaryData);

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
