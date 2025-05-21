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
        console.log('rest:', row, 'row');
        return { ...rest };
    });
    console.log('gridToRow rows: ', rows);
    console.log('gridToRows columns: ', gridRows[0]);
    
    const { columnNames: mcn, columnOrder: mco, rows: currentRows } = model.api.getSnapshot();
    const columnNames = mcn[mco] || {};
    console.log('gridToRows columnNames: ', columnNames);
    
    const cn = model.api.vec(['columnNames']);
    const co = model.api.arr(['columnOrder']);
    const rowsArr = model.api.arr(['rows']);

    // add columns to model
    cn.set([[0, model.api.builder.val()]]);
    cn.set([[0, konst('colOne')]]);
    co.ins(0, [konst(0)]); // change columnOrder
    cn.set([[1, model.api.builder.val()]]);
    cn.set([[1, konst('id')]]);
    co.ins(1, [konst(1)]); // change columnOrder
    co.del(2, 4);

    const { columnNames: mcnUpdate, columnOrder: mcoUpdate } = model.api.getSnapshot();

    // Delete rows that are no longer in gridRows
    const currentRowCount = rowsArr.length();
    if (currentRowCount > gridRows.length) {
        // Delete rows from the end
        for (let i = currentRowCount - 1; i >= gridRows.length; i--) {
            console.log('Deleting row at index', i);
            rowsArr.del(i, i + 1);
        }
    }

    // Apply row changes
    // Update existing rows and add new ones
    for (let i = 0; i < gridRows.length; i++) {
        // Check if row exists at index i before trying to get it
        console.log('rowsArr length:', rowsArr.length());
        const rowExists = i < rowsArr.length();
        
        if (!rowExists) {
            console.log('Adding a new row at index', i);
            rowsArr.ins(i, [model.api.builder.vec()]);
        }
        
        const editedRow = gridRows[i];
        console.log('editedRow:', editedRow);
        const rowVec = (rowsArr.get(i) as VecApi<any>);
        
        // Update each cell in the row
        Object.entries(editedRow).forEach(([key, value]) => {
            console.log('key:', key, value);
            const columnIndex = mcnUpdate.indexOf(key);
            console.log('columnIndex:', columnIndex);
            if (!isNaN(columnIndex)) {
                console.log('Updating row:', i, 'column:', mcnUpdate[columnIndex], 'index: ', columnIndex, 'value:', value);
                rowVec.set([[columnIndex, konst(value)]]);
            }
        });
    }
    
    return model;
}

function modelToGrid(model) {
    const rows = model.api.getSnapshot().rows;
    const columnNames = model.api.getSnapshot().columnNames;
    const columnOrder = model.api.getSnapshot().columnOrder;
    console.log('row converted:', rows);
    // convert rows to grid format
    const gridRows = rows.map(row => {
        const rowObj = {};
        // Use columnOrder to determine which columnNames to use and in what order
        columnOrder.forEach((index, i) => {
            if (columnNames[index]) {
                rowObj[columnNames[index]] = row[index];
            }
        });
        return rowObj;
    }
    );
    console.log('columnNames: ', columnNames)
    console.log('columnOrder: ', columnOrder)
    console.log('rows: ', rows)
    //return [{'colOne': rows}];
    console.log('gridRows:', gridRows)
    return gridRows
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
        return initialSnapshot?.rows?.length ? modelToGrid(modelRef.current) : [{ colOne: null }];
    });
        // Create reactive values for rows and columns
    const [gridColumns, setGridColumns] = useState<Column[]>([
        {...keyColumn('colOne', textColumn), title: 'colOne'},
        {...keyColumn('id', textColumn), title: 'id'}
    ]);
    const [prevRows, setPrevRows] = useState(gridRows)

    const isFirstMessageRef = useRef(true);

    useEffect(() => {
        if (!modelRef.current || !modelRef.current.api) return;
        
        // Set initial snapshot
        setSnapshot(modelRef.current.api.getSnapshot());
        // Update grid rows immediately when model is set
        setGridRows(modelToGrid(modelRef.current));
        
        // Subscribe to model changes
        const unsubscribe = modelRef.current.api.subscribe(() => {
            console.log("Model changed - updating snapshot");
            setSnapshot(modelRef.current?.api.getSnapshot());
            // Update grid rows whenever model changes
            setGridRows(modelToGrid(modelRef.current));
            setPrevRows(modelRef.current?.api.getSnapshot().rows || []);
        });
        
        // Clean up subscription when component unmounts or model changes
        return () => {
            console.log("Cleaning up model subscription");
            unsubscribe();
        };
    }, [modelRef.current]); // Re-run when modelRef.current changes
    

    function processMessage(binaryData) {
        console.log('Processing message:', binaryData);
        if (isFirstMessageRef.current) {
            try {
                const bd = Uint8Array.from(Object.values(binaryData));
                const model = Model.fromBinary(bd).fork(sessionId);
                console.log('Model successfully created:', model.view());
                return model;
            } catch (e) {
                console.error('Error creating model from binary data:', e);
                return null;
            }
        }
        return null;
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
    
            try {
                if (event.data instanceof Blob) {
                    console.log('Received blob data');
                    // Convert Blob to ArrayBuffer first
                    const reader = new FileReader();
                    reader.onload = () => {
                        const arrayBuffer = reader.result as ArrayBuffer;
                        message = new Uint8Array(arrayBuffer);
                        const updatedModel = processMessage(message);
                        if (updatedModel) {
                            setModel(updatedModel);
                            // Update grid rows based on new model
                            setGridRows(modelToGrid(updatedModel));
                        }
                    };
                    reader.readAsArrayBuffer(event.data);
                    return;
                } else if (typeof event.data === 'string') {
                    console.log('Received string data');
                    const parsed = JSON.parse(event.data);
                    
                    if (isFirstMessageRef.current) {
                        // First message - create a new model
                        message = new Uint8Array(Object.values(parsed));
                        const updatedModel = processMessage(message);
                        if (updatedModel) {
                            setModel(updatedModel);
                            setGridRows(modelToGrid(updatedModel));
                            isFirstMessageRef.current = false;
                        }
                    } else {
                        // Subsequent messages - apply patch to existing model
                        if (!modelRef.current) return;
                        
                        try {
                            const patchData = decode(parsed);
                            modelRef.current.applyPatch(patchData);
                            console.log("Applied patch to model");
                            // Update the UI after applying patch
                            setGridRows(modelToGrid(modelRef.current));
                        } catch (error) {
                            console.error("Error applying patch:", error);
                        }
                    }
                }
            } catch (e) {
                console.error('Error processing WebSocket message:', e);
            }
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
        console.log('Grid data:', gridRows);
        const newData = gridRows.filter(({ id }) => !deletedRowIds.has(id))
        console.log('New data:', newData);
        setGridRows(newData)
        setPrevRows(newData)
        setModel(gridToModel(newData, getModel()))
        const patch = getModel()?.api.flush()
        let binaryData;
        if (patch) binaryData = encode(patch);
        console.log('Patch data upload:', patch);
        sendThrottledJsonMessage(binaryData);

        createdRowIds.clear()
        deletedRowIds.clear()
        updatedRowIds.clear()
    }

    function genId() {
        return Math.floor(Math.random() * 1000000);
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
