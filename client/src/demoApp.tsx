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
        const { ...rest } = row;
        return { ...rest };
    });
    console.log('rows', rows)
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

function modelToGrid(model) {
    const rows = model.api.getSnapshot().rows;
    const columnNames = model.api.getSnapshot().columnNames;
    const columnOrder = model.api.getSnapshot().columnOrder;
    console.log('row converted:', rows);
    console.log('columnNames:', columnNames);
    console.log('columnOrder:', columnOrder);
    // convert rows to grid format
    const gridRows = rows.map(row => {
        console.log('row:', row);
        const { id, ...rest } = row;
        return [{'colOne': 'bobobbo'}];
    }
    );
    console.log('gridRows:', gridRows);
    return [{'colOne': rows}];
    //return gridRows.map(row => {
}

function App() {

    const modelRef = useRef<Model | null>(null);
    const getModel = () => modelRef.current;
        const setModel = (newModel: any) => {
        if (newModel !== modelRef.current) {
            console.log("Setting new model");
            modelRef.current = newModel;
            // Force the effect to run by updating a state variable
            setModelVersion(prev => prev + 1);
        }
    };
    const [snapshot, setSnapshot] = useState<any>([{rows: [], columnNames: [], columnOrder: []}]);
    const [modelVersion, setModelVersion] = useState(0);
        const [gridRows, setGridRows] = useState<Record<string, any>[]>(() => {
        const initialSnapshot = modelRef.current?.api?.getSnapshot();
        return initialSnapshot?.rows?.length ? modelToGrid(initialSnapshot) : [{ colOne: null }];
    });
        // Create reactive values for rows and columns
    const [gridColumns, setGridColumns] = useState<Column[]>([
        //{...keyColumn('id', textColumn), title: 'id'},
        {...keyColumn('colOne', textColumn), title: 'colOne'}
    ]);
    const [prevRows, setPrevRows] = useState(gridRows)

    const isFirstMessageRef = useRef(true);

    useEffect(() => {
        if (!modelRef.current || !modelRef.current.api) return;
        
        // Set initial snapshot
        setSnapshot(modelRef.current.api.getSnapshot());
        
        // Subscribe to model changes
        const unsubscribe = modelRef.current.api.subscribe(() => {
            console.log("Model changed - updating snapshot");
            setSnapshot(modelRef.current?.api.getSnapshot());
            console.log("Snapshot:", modelRef.current?.api.getSnapshot());
            setGridRows(modelToGrid(modelRef.current));
            setGridColumns(
                (modelRef.current?.api.getSnapshot().columnNames || [])
                .map((name, i) => ({...keyColumn(name, textColumn), title: name}))
            );
            setPrevRows(modelRef.current?.api.getSnapshot().rows || []);
        });
        
        // Clean up subscription when component unmounts or model changes
        return () => {
            console.log("Cleaning up model subscription");
            unsubscribe();
        };
    }, [modelRef.current]); // Re-run when modelRef.current changes
    

    function processMessage(binaryData) {
        console.log('First message:', isFirstMessageRef.current);
        console.log('processing message:', binaryData);
        if (isFirstMessageRef.current) {
            try {
                const bd = Uint8Array.from(Object.values(binaryData))
                const model = Model.fromBinary(bd).fork(sessionId);
                console.log('Model successfully created:', model);
                return model;
            } catch (e) {
                console.error('Error processing message:', e);
            }
        } else {
            if (!modelRef.current) return;
                
            //const patchData = Uint8Array.from(Object.values(binaryData));
            console.log('Binary data:', binaryData);
            const patchData = decode(JSON.parse(binaryData));
            try {
                //const patch = Patch.patchData;
                setModel(modelRef.current.applyPatch(patchData));
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
                    processMessage(message);
                };
                reader.readAsArrayBuffer(event.data);
                return;
            } else if (typeof event.data === 'string') {
                // Handle string data
                try {
                    if (isFirstMessageRef.current) {
                        console.log('First message model')
                        const parsed = JSON.parse(event.data);
                        message = new Uint8Array(Object.values(parsed));
                        if (!message) {
                            message = decode(JSON.parse(event.data));
                        }
                        setModel(modelRef.current?.applyPatch(message));
                    } else {
                        console.log('Not first message model - apply patch')
                        const parsed = JSON.parse(event.data)
                        const message = decode(parsed)
                        console.log('message', message)
                        modelRef.current?.applyPatch(message)
                    }
                    console.log('input string')
                    console.log(event.data)
                    
                } catch (e) {
                    console.error('Failed to parse string data:', e);
                    return;
                }
            } else {
                // Assume it's already binary
                //message = new Uint8Array(event.data);
                message = decode(JSON.parse(event.data));
            }
            console.log('ed.dec', decode(JSON.parse(event.data)))
            console.log('ed.json', JSON.parse(event.data))
            console.log('event.data', event.data)
            console.log('message', message)
            if (message) setModel(processMessage(message));
            console.log('model', model)
            console.log('message', message)
            console.log('snapshot', getModel()?.api.getSnapshot())
            console.log('rows', getModel()?.api.getSnapshot().rows)
            console.log('columnNames', getModel()?.api.getSnapshot().columnNames)
            console.log('columnOrder', getModel()?.api.getSnapshot().columnOrder)
            //setSnapshot(getModel()?.api.getSnapshot());
            console.log('snapsho', snapshot)
            //setGridRows(getModel()?.api.getSnapshot().rows);
            //setGridColumns(getModel()?.api.getSnapshot().columnOrder);
            //setPrevRows(getModel()?.api.getSnapshot().rows);
            console.log('Received message:', message);
            console.log('Updated model:', getModel()?.toString());
            console.log('Updated model snapshot:', getModel()?.api.getSnapshot());
            console.log('Updated model rows:', getModel()?.view());
            console.log('rows', modelToGrid(getModel()));
            setGridRows(modelToGrid(getModel()));
            console.log('grid rows', gridRows);
            console.log('Snapshot:', snapshot ? snapshot : 'unloaded');
            isFirstMessageRef.current = false;
        },
        shouldReconnect: (closeEvent) => {
            console.log('WebSocket closed. Reconnecting...', closeEvent)
            return true
        },
        reconnectAttempts: 5,
        reconnectInterval: 1000,
    },)

    const THROTTLE = 50;
    const sendJsonMessageThrottled = useRef(throttle(sendJsonMessage, THROTTLE));
    const sendThrottledJsonMessage = (message: any) => {
        sendJsonMessageThrottled.current(message);
    };

    const [modelRows, setModelRows] = useState<[]>(snapshot ? snapshot.rows : {})
    const [modelColumnNames, setModelColumnNames] = useState<[]>(snapshot ? snapshot.columnNames : {})
    const [modelColumnOrder, setModelColumnOrder] = useState<[]>(snapshot ? snapshot.columnOrder : {})

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
        let binaryData;
        if (patch) binaryData = encode(patch);
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
