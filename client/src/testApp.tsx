import { useEffect, useSyncExternalStore, useRef, useMemo, useState } from "react";
import useWebSocket from "react-use-websocket";
import { Model, VecApi, ClockVector } from 'json-joy/lib/json-crdt';
import { Patch, konst } from 'json-joy/lib/json-crdt-patch';
import throttle from 'lodash.throttle';

const sessionId = Math.floor(Math.random() * 1000000);

function setGridDefaultCols(model: Model) {
    if (!model) {
        console.error("Model is not defined");
        return;
    }
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
    const r1 = (rows.get(1)  as VecApi<any>);
    r1.set([[0, konst('cat')],[1, konst(15)],[2, konst('paws')]])

    // 8. add a new row after first with type=rat, name=whiskers
    rows.ins(1, [model.api.builder.vec()]);
    const r2 = (rows.get(1)  as VecApi<any>);
    r2.set([[0, konst('rat')],[1, konst(2)],[2, konst('whiskers')]])

    return  model.api.flush().toBinary();
}

function App() {
    const { lastJsonMessage, sendJsonMessage, sendMessage, lastMessage } = useWebSocket("ws://localhost:8000");
    // Track if we've created our model yet
    const modelRef = useRef<Model | null>(null);
    const isFirstMessageRef = useRef(true);
    const [snapshot, setSnapshot] = useState<any>(null);
    // const modelSnapshot = useMemo(() => {
    //     if (modelRef.current) {
    //         // Create a snapshot of the model
    //         return modelRef.current.api.getSnapshot();
    //     }
    //     return null;
    // }, [modelRef.current]);

    useEffect(() => {
        if (!lastJsonMessage) return;
        
        if (isFirstMessageRef.current) {
            // First message: create and fork the model
            const message = Uint8Array.from(Object.values(lastJsonMessage));
            modelRef.current = Model.fromBinary(message).fork(sessionId);
            console.log("Created initial model with sessionId:", sessionId);
            isFirstMessageRef.current = false;
        } else {
            // Subsequent messages: apply as patches
            if (!modelRef.current) return;
            
            const patchData = Uint8Array.from(Object.values(lastJsonMessage));
            try {
                const patch = Patch.fromBinary(patchData);
                modelRef.current.applyPatch(patch);
                console.log("Applied patch to model");
            } catch (error) {
                console.error("Error applying patch:", error);
            }
        }
    }, [lastJsonMessage]);

        useEffect(() => {
        if (!modelRef.current) return;
        
        // Initial snapshot
        setSnapshot(modelRef.current.api.getSnapshot());
        
        // Subscribe to changes
        const unsubscribe = modelRef.current.api.subscribe(() => {
            // Update snapshot when model changes
            setSnapshot(modelRef.current?.api.getSnapshot() || null);
        });
        
        return () => unsubscribe();
    }, [modelRef.current]);
    
    // Use the snapshot state for rendering
    const { columnNames = [], columnOrder = [], rows = [] } = snapshot || {};
    

    // Subscribe to model changes and send updates to server
    // useEffect(() => {
    //     if (!modelRef.current) return;
        
    //     const unsubscribe = modelRef.current.api.subscribe(() => {
    //         // Flush changes to get the patch and send to server
    //         const patch = modelRef.current?.api.flush();
    //         if (patch) {
    //             sendThrottledJsonMessage(patch.toBinary());
    //             console.log("Automatically sent model updates to server");
    //         }
    //     });
        
        // Clean up subscription when component unmounts
    //     return () => unsubscribe();
    // }, [modelRef.current, lastJsonMessage]);

    // let modelSnapshot: any
    // let model: any;
    // const message = lastJsonMessage ? Uint8Array.from(Object.values(lastJsonMessage)) : null;
    // if (!modelSnapshot) {
    //     // Create a new Model instance
    //     //if (!model || model === undefined) {
    //         //console.log("model is:", model);
            
    //         //const model = Model.fromBinary(Uint8Array.from(Object.values(lastJsonMessage))).fork();
    //         console.log("sessionId", sessionId);
    //         const model = message ? Model.fromBinary(message).fork(sessionId) : null;
    //         console.log("Received message:", model ? model.toString(): "No model");
    //         modelSnapshot = model ? model.api.getSnapshot() : null;
    //         console.log("Model snapshot:", modelSnapshot);
    //     } else {
    //         // Patch existing model with new data
    //         //const patchData = Uint8Array.from(Object.values(lastJsonMessage));
    //         // Apply the patch to the model (you'd need to implement this logic)
    //         console.log("Received patch data:", message);
    //         //model.api.flush();
    //         message ? model.applyPatch(Patch.fromBinary(message)) : null;
    //         console.log("Model after patch:", model.toString());
    //         modelSnapshot = model.api.getSnapshot();
    //     }
    // modelSnapshot = useMemo(() => {
    //     if (model) {
    //         // Create a snapshot of the model
    //         return model.api.getSnapshot();
    //     }
    //     return null;
    // }, [model]);
    //const { columnNames = [], columnOrder, rows} = modelSnapshot || {};

    // Track whether we've received the first message
    //const isFirstMessageRef = useRef(true);
    
    // Handle the first message differently
    // useEffect(() => {
    //     if (lastJsonMessage && !isFirstMessageRef.current) {
    //         // Not the first message, compute patch
    //         const patchData = Uint8Array.from(Object.values(lastJsonMessage));
    //         // Apply the patch to the model (you'd need to implement this logic)
    //         console.log("Received patch data:", patchData);
    //     }
        
    //     if (lastJsonMessage) {
    //         // Once we've processed a message, it's no longer the first
    //         isFirstMessageRef.current = false;
    //     }
    // }, [lastJsonMessage]);

    // const model = useMemo(() => {
    //     if (lastJsonMessage) {
    //         return Model.fromBinary(Uint8Array.from(Object.values(lastJsonMessage))).fork();
    //     }
    //     return Model.create();
    // }, [lastJsonMessage]);
    // const node = useMemo(
    //     ():any => model.api.getSnapshot,
    //     [model]);
    // const view: any = useSyncExternalStore(
    //     model.api.subscribe,
    //     model.api.getSnapshot,
    //     () => model.api.getSnapshot
    // );
    // const { columnNames = [], columnOrder = [], rows = [] } = view || {};

    // useEffect(() => {
    //     if (model) {
    //         // Subscribe to the model
    //         const unsubscribe = model.api.subscribe((newModel: Model) => {
    //             console.log("Model updated:", newModel);
    //         });
    //         // Cleanup function to unsubscribe from the model
    //         return () => {
    //             unsubscribe();
    //         };
    //     }
    // }, [model]);

    // const MyComponent = () => {
    // const view = React.useSyncExternalStore(
    //     model.api.subscribe,
    //     model.api.getSnapshot, [model]);
    
    // return <MyTitle post={view.post} />
    // };

    // const MyTitle = React.memo(({post}) => {
    // return <h1>{post.title}</h1>;
    // });

    // OR
    // const MyTitle = () => {
    // const node = React.useMemo(
    //     () => model.api.str(['post', 'title']),
    //     [model]);
    // const title = React.useSyncExternalStore(
    //     node.events.subscribe,
    //     node.events.getSnapshot,
    //     [node]);
    
    // return <h1>{title}</h1>;
    // };

    // Throttle the sendJsonMessage function to limit the rate of sending messages
    const THROTTLE = 50;
    const sendJsonMessageThrottled = useRef(throttle(sendJsonMessage, THROTTLE));
    const sendMessageThrottled = useRef(throttle(sendMessage, THROTTLE));
    // Use the throttled function to send messages
    const sendThrottledJsonMessage = (message: any) => {
        sendJsonMessageThrottled.current(message);
    };
    const sendThrottledMessage = (message: any) => {
        sendMessageThrottled.current(message);
    };

    // Send the rows object to the WebSocket server when it changes
    // useEffect(() => {
    //     if (rows && rows.length > 0) {
    //         sendThrottledJsonMessage({ rows });
    //         console.log("Rows sent to server:", rows);
    //     }
    // }, [rows, sendJsonMessage]);

    //if (lastJsonMessage) {
        // Add state for editable values
    const [editedColumnNames, setEditedColumnNames] = useState<string[]>([]);
    const [editedColumnOrder, setEditedColumnOrder] = useState<number[]>([]);
    const [editedRows, setEditedRows] = useState<any[]>([]);
    
    // Initialize editable values when snapshot changes
    useEffect(() => {
        if (snapshot) {
            setEditedColumnNames([...columnNames]);
            setEditedColumnOrder([...columnOrder]);
            setEditedRows(JSON.parse(JSON.stringify(rows))); // Deep copy
        }
    }, [snapshot]);
    
    // Apply changes to the model
    const applyChanges = () => {
        if (!modelRef.current) return;
        
        // Get references to model parts
        const cn = modelRef.current.api.vec(['columnNames']);
        const co = modelRef.current.api.arr(['columnOrder']);
        const rowsArr = modelRef.current.api.arr(['rows']);
        
        // Apply column name changes
        editedColumnNames.forEach((name, index) => {
            cn.set([[index, konst(name)]]);
        });
        
        // Apply column order changes
        // Clear existing column order
        while (columnOrder.length > 0) {
            co.del(0, 1);
        }
        
        // Add new column order
        editedColumnOrder.forEach((colIndex, index) => {
            co.ins(index, [konst(colIndex)]);
        });
        
        // Apply row changes
        // First, update existing rows
        const minLength = Math.min(rows.length, editedRows.length);
        for (let i = 0; i < minLength; i++) {
            const rowVec = rowsArr.get(i) as VecApi<any>;
            const editedRow = editedRows[i];
            
            // Update each cell in the row
            Object.entries(editedRow).forEach(([key, value]) => {
                const columnIndex = parseInt(key);
                if (!isNaN(columnIndex)) {
                    rowVec.set([[columnIndex, konst(value)]]);
                }
            });
        }
        
        // Add new rows
        for (let i = rows.length; i < editedRows.length; i++) {
            rowsArr.ins(i, [modelRef.current.api.builder.vec()]);
            const rowVec = rowsArr.get(i) as VecApi<any>;
            const editedRow = editedRows[i];
            
            Object.entries(editedRow).forEach(([key, value]) => {
                const columnIndex = parseInt(key);
                if (!isNaN(columnIndex)) {
                    rowVec.set([[columnIndex, konst(value)]]);
                }
            });
        }
        
        // Remove extra rows
        if (editedRows.length < rows.length) {
            rowsArr.del(editedRows.length, rows.length - editedRows.length);
        }
        
        // Send changes to server
        const patch = modelRef.current.api.flush();
        sendThrottledJsonMessage(patch.toBinary());
        console.log("Applied changes and sent to server");
    };
    
    // Handle input changes
    const handleColumnNameChange = (index: number, value: string) => {
        const newNames = [...editedColumnNames];
        newNames[index] = value;
        setEditedColumnNames(newNames);
    };
    
    const handleColumnOrderChange = (index: number, value: string) => {
        const newOrder = [...editedColumnOrder];
        newOrder[index] = parseInt(value);
        setEditedColumnOrder(newOrder);
    };
    
    const handleRowChange = (rowIndex: number, colIndex: number, value: any) => {
        const newRows = [...editedRows];
        if (!newRows[rowIndex]) {
            newRows[rowIndex] = {};
        }
        newRows[rowIndex][colIndex] = value;
        setEditedRows(newRows);
    };
    
    const addRow = () => {
        const newRow = {};
        editedColumnOrder.forEach(colIndex => {
            newRow[colIndex] = "";
        });
        setEditedRows([...editedRows, newRow]);
    };
    
    const deleteRow = (index: number) => {
        const newRows = [...editedRows];
        newRows.splice(index, 1);
        setEditedRows(newRows);
    };

    return (
        <div>
            <h1>WebSocket Message Viewer</h1>
            <div>
                {snapshot ? (
                    <div>
                        <h2>Model Snapshot:</h2>
                        <div className="data-editor">
                            <h3>Column Names:</h3>
                            <div className="column-names">
                                {editedColumnNames.map((name, index) => (
                                    <div key={`col-name-${index}`} className="input-group">
                                        <label>Column {index}:</label>
                                        <input
                                            type="text"
                                            value={name}
                                            onChange={(e) => handleColumnNameChange(index, e.target.value)}
                                        />
                                    </div>
                                ))}
                                <button onClick={() => setEditedColumnNames([...editedColumnNames, ""])}>
                                    Add Column
                                </button>
                            </div>
                            
                            <h3>Column Order:</h3>
                            <div className="column-order">
                                {editedColumnOrder.map((colIndex, index) => (
                                    <div key={`col-order-${index}`} className="input-group">
                                        <label>Position {index}:</label>
                                        <input
                                            type="number"
                                            value={colIndex}
                                            onChange={(e) => handleColumnOrderChange(index, e.target.value)}
                                        />
                                    </div>
                                ))}
                            </div>
                            
                            <h3>Rows:</h3>
                            <div className="rows-editor">
                                <table>
                                    <thead>
                                        <tr>
                                            {editedColumnOrder.map((colIndex) => (
                                                <th key={`header-${colIndex}`}>
                                                    {editedColumnNames[colIndex] || `Column ${colIndex}`}
                                                </th>
                                            ))}
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {editedRows.map((row, rowIndex) => (
                                            <tr key={`row-${rowIndex}`}>
                                                {editedColumnOrder.map((colIndex) => (
                                                    <td key={`cell-${rowIndex}-${colIndex}`}>
                                                        <input
                                                            type="text"
                                                            value={row[colIndex] || ""}
                                                            onChange={(e) => handleRowChange(rowIndex, colIndex, e.target.value)}
                                                        />
                                                    </td>
                                                ))}
                                                <td>
                                                    <button onClick={() => deleteRow(rowIndex)}>Delete</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <button onClick={addRow}>Add Row</button>
                            </div>
                            
                            <div className="actions">
                                <button 
                                    onClick={applyChanges}
                                    className="primary"
                                >
                                    Apply Changes & Send to Server
                                </button>
                            </div>
                        </div>
                        
                        <h3>Current Data:</h3>
                        <pre>{JSON.stringify(snapshot, null, 2)}</pre>
                    </div>
                ) : (
                    <p>Waiting for model data...</p>
                )}
            </div>
            
            <div className="button-group">
                <button
                    onClick={() => {
                        if (modelRef.current) {
                            const modelSend = setGridDefaultCols(modelRef.current);
                            // Send changes to server
                            sendThrottledJsonMessage(modelSend);
                            console.log("Set grid default columns and sent to server");
                        } else {
                            console.error("Model is not initialized yet");
                        }
                    }}
                >Add Default Data</button>
            </div>
        </div>
    );
}

export default App;
