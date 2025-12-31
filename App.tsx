
import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { PunchCardData, ProcessingStatus, NameMapping, PunchEntry, StaffInfo } from './types';
import { extractPunchCardData } from './services/geminiService';
import { DataTable } from './components/DataTable';
import { ProcessingOverlay } from './components/ProcessingOverlay';

const MAX_PHOTOS = 30;

export default function App() {
  const [records, setRecords] = useState<PunchCardData[]>([]);
  const [pendingQueue, setPendingQueue] = useState<PunchCardData[]>([]);
  const [processedPhotosCount, setProcessedPhotosCount] = useState(0);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(0);
  const [status, setStatus] = useState<ProcessingStatus>(ProcessingStatus.IDLE);
  const [error, setError] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  
  const [nameMappings, setNameMappings] = useState<NameMapping[]>(() => {
    const saved = localStorage.getItem('punchcard_name_mappings');
    return saved ? JSON.parse(saved) : [];
  });
  const [staffDatabase, setStaffDatabase] = useState<StaffInfo[]>(() => {
    const saved = localStorage.getItem('punchcard_staff_db');
    return saved ? JSON.parse(saved) : [];
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMoreInputRef = useRef<HTMLInputElement>(null);
  const staffInputRef = useRef<HTMLInputElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const currentRecord = pendingQueue[currentQueueIndex] || null;

  useEffect(() => {
    localStorage.setItem('punchcard_name_mappings', JSON.stringify(nameMappings));
  }, [nameMappings]);

  useEffect(() => {
    localStorage.setItem('punchcard_staff_db', JSON.stringify(staffDatabase));
  }, [staffDatabase]);

  // Reset zoom and pan whenever moving to a new record or changing zoom back to 1
  useEffect(() => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  }, [currentQueueIndex]);

  useEffect(() => {
    if (zoomLevel === 1) {
      setPanOffset({ x: 0, y: 0 });
    }
  }, [zoomLevel]);

  const processFile = async (file: File, append: boolean) => {
    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result as string;
        try {
          const officialNames = staffDatabase.map(s => s.name);
          const extractedBatch = await extractPunchCardData(base64, nameMappings, officialNames);
          setPendingQueue(prev => [...prev, ...extractedBatch]);
          setProcessedPhotosCount(prev => prev + 1);
          resolve();
        } catch (err: any) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("File read error"));
      reader.readAsDataURL(file);
    });
  };

  const handleStaffUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet) as any[];

        const mapped = json.map(row => {
          const name = row.Name || row.name || row['Staff Name'] || Object.values(row)[0];
          const wage = row.Wage || row.wage || row.Rate || 0;
          const effectiveDate = row['Effective Date'] || row.date || '';
          return { name: String(name), wage, effectiveDate: String(effectiveDate) };
        }).filter(s => s.name && s.name !== 'undefined');

        setStaffDatabase(mapped);
        setError(null);
        alert(`Successfully imported ${mapped.length} staff records.`);
      } catch (err) {
        setError('Failed to parse staff list. Please ensure it is a valid Excel or CSV file.');
      }
    };
    reader.readAsBinaryString(file);
    event.target.value = '';
  };

  const triggerAddMore = () => addMoreInputRef.current?.click();
  const triggerStaffUpload = () => staffInputRef.current?.click();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, append = false) => {
    const files = Array.from(event.target.files || []) as File[];
    if (files.length === 0) return;

    if (!append) {
      setPendingQueue([]);
      setCurrentQueueIndex(0);
      setProcessedPhotosCount(0);
    }

    const totalAllowed = MAX_PHOTOS - (append ? processedPhotosCount : 0);
    const filesToProcess = files.slice(0, totalAllowed);

    if (files.length > totalAllowed) {
      setError(`Limit of ${MAX_PHOTOS} photos reached. Processing first ${totalAllowed} files.`);
    } else {
      setError(null);
    }

    setStatus(ProcessingStatus.UPLOADING);

    try {
      setStatus(ProcessingStatus.ANALYZING);
      for (const file of filesToProcess) {
        await processFile(file, append);
      }
      setStatus(ProcessingStatus.COMPLETED);
    } catch (err: any) {
      setError(err.message || 'Failed to process images');
      setStatus(ProcessingStatus.ERROR);
      if (append && pendingQueue.length > 0) setStatus(ProcessingStatus.COMPLETED);
    }
    event.target.value = '';
  };

  const handleUpdateName = (newName: string) => {
    if (!currentRecord) return;
    const updatedQueue = [...pendingQueue];
    updatedQueue[currentQueueIndex] = { ...currentRecord, staffName: newName };
    setPendingQueue(updatedQueue);

    const existing = nameMappings.find(m => m.extracted === currentRecord.staffName);
    if (!existing) {
      setNameMappings(prev => [...prev, { extracted: currentRecord.staffName, corrected: newName }]);
    } else if (existing.corrected !== newName) {
      setNameMappings(prev => prev.map(m => m.extracted === currentRecord.staffName ? { ...m, corrected: newName } : m));
    }
  };

  const handleUpdateEntries = (updatedEntries: PunchEntry[]) => {
    if (!currentRecord) return;
    const updatedQueue = [...pendingQueue];
    updatedQueue[currentQueueIndex] = { ...currentRecord, entries: updatedEntries };
    setPendingQueue(updatedQueue);
  };

  const saveAndNext = () => {
    if (!currentRecord) return;
    setRecords(prev => [currentRecord, ...prev]);
    
    if (currentQueueIndex < pendingQueue.length - 1) {
      setCurrentQueueIndex(prev => prev + 1);
    } else {
      setPendingQueue([]);
      setCurrentQueueIndex(0);
      setProcessedPhotosCount(0);
      setStatus(ProcessingStatus.IDLE);
    }
  };

  const cancelBatch = () => {
    if (confirm("Discard this entire batch?")) {
      setPendingQueue([]);
      setCurrentQueueIndex(0);
      setProcessedPhotosCount(0);
      setStatus(ProcessingStatus.IDLE);
    }
  };

  const downloadCSV = () => {
    if (records.length === 0) return;
    const headers = ['Staff Name', 'Date (yyyy/mm/dd)', 'Time In', 'Time Out'];
    const rows = records.flatMap(rec => 
      rec.entries.map(entry => [
        `"${rec.staffName}"`,
        `"${entry.date}"`,
        `"${entry.timeIn || ''}"`,
        `"${entry.timeOut || ''}"`
      ])
    );

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `punch_cards_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (zoomLevel <= 1) return;
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragStartRef.current = { x: clientX - panOffset.x, y: clientY - panOffset.y };
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging || zoomLevel <= 1) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setPanOffset({
      x: clientX - dragStartRef.current.x,
      y: clientY - dragStartRef.current.y
    });
  };

  const stopDragging = () => setIsDragging(false);

  const lastMonthName = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toLocaleString('default', { month: 'long' });

  return (
    <div className="min-h-screen pb-20 bg-slate-50">
      <ProcessingOverlay status={status} />
      
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-indigo-100 text-xl">P</div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">PunchCard Digitizer</h1>
              <p className="text-xs text-slate-500 font-medium">Batch Processing (Up to {MAX_PHOTOS} Photos)</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <button
                onClick={triggerStaffUpload}
                className="px-4 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-all flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                Staff List ({staffDatabase.length})
                <input ref={staffInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleStaffUpload} />
              </button>
            <button
              onClick={downloadCSV}
              disabled={records.length === 0}
              className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg transition-all flex items-center gap-2 shadow-md"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Export CSV
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {!currentRecord ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="bg-white border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center hover:border-indigo-400 transition-all cursor-pointer relative group bg-indigo-50/10"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => handleFileUpload(e, false)}
                  className="hidden"
                />
                <div className="flex flex-col items-center">
                  <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 mb-2">Select Batch Photos</h3>
                  <p className="text-slate-500 max-w-sm mx-auto">Upload up to {MAX_PHOTOS} photos. Gemini extracts <strong>all records</strong>, including partial ones.</p>
                </div>
              </div>

              {error && (
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-amber-800 text-sm flex items-center gap-3">
                  <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <h2 className="text-xl font-black text-slate-900">Digitized Archive ({records.length})</h2>
                {records.length === 0 ? (
                  <div className="text-center py-20 bg-white rounded-2xl border border-slate-100">
                    <p className="text-slate-400 font-medium">No records digitized yet.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {records.map(rec => (
                      <div key={rec.id} className="bg-white border border-slate-200 rounded-xl p-4 flex gap-4 hover:shadow-lg transition-all group border-l-4 border-l-indigo-500">
                        <div className="w-16 h-16 shrink-0 relative overflow-hidden rounded-lg bg-slate-100">
                          <img src={rec.imageUrl} alt="Thumb" className="absolute inset-0 w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-slate-900 truncate group-hover:text-indigo-600">{rec.staffName}</h4>
                          <p className="text-xs text-slate-500 font-mono mt-1">{rec.entries.length} rows digitized</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl shadow-indigo-100">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                  Digitization Logic
                </h3>
                <ul className="space-y-4">
                  <li className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-xs font-bold shrink-0">1</span>
                    <p className="text-sm text-slate-300">Preserves <strong>incomplete rows</strong> (e.g., missed clock-outs) for full transparency.</p>
                  </li>
                  <li className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-xs font-bold shrink-0">2</span>
                    <p className="text-sm text-slate-300">Dates default to <strong>{lastMonthName}</strong> for ambiguity.</p>
                  </li>
                  <li className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-xs font-bold shrink-0">3</span>
                    <p className="text-sm text-slate-300">Single-digit hours (e.g., 7:00) are auto-formatted to 24hr PM (19:00).</p>
                  </li>
                </ul>
              </div>

              {staffDatabase.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                     <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                     Staff Database Active
                  </h3>
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
                    {staffDatabase.slice(0, 10).map((s, i) => (
                      <div key={i} className="text-[10px] flex justify-between border-b border-slate-50 pb-1">
                        <span className="font-semibold text-slate-700 truncate max-w-[120px]">{s.name}</span>
                        <span className="text-slate-400">${s.wage}</span>
                      </div>
                    ))}
                    {staffDatabase.length > 10 && (
                      <p className="text-[10px] text-slate-400 italic text-center">+{staffDatabase.length - 10} more...</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-4">
                <span className="px-3 py-1 bg-indigo-100 text-indigo-700 text-xs font-black rounded-full uppercase">
                  Review Queue
                </span>
                <span className="text-sm font-bold text-slate-600">
                  Record {currentQueueIndex + 1} of {pendingQueue.length}
                </span>
              </div>
              <div className="flex-1 max-w-xs mx-8 bg-slate-100 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-indigo-600 h-full transition-all duration-300"
                  style={{ width: `${((currentQueueIndex + 1) / pendingQueue.length) * 100}%` }}
                />
              </div>
              <button onClick={cancelBatch} className="text-xs font-bold text-red-500 hover:text-red-700">
                Discard Batch
              </button>
            </div>

            <div className="flex flex-col lg:flex-row gap-8">
              <div className="lg:w-1/3 space-y-4">
                <div className="sticky top-24 space-y-4">
                  {/* Zoomable & Draggable Image Container */}
                  <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-2 right-2 z-10 flex gap-2">
                      <span className="px-2 py-1 bg-black/50 backdrop-blur-sm text-white text-[10px] font-bold rounded-lg pointer-events-none">
                        Zoom: {zoomLevel.toFixed(1)}x
                      </span>
                    </div>
                    <div 
                      className={`relative h-[600px] bg-slate-50 rounded-xl overflow-hidden ${zoomLevel > 1 ? 'cursor-move' : 'cursor-default'}`}
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={stopDragging}
                      onMouseLeave={stopDragging}
                      onTouchStart={handleMouseDown}
                      onTouchMove={handleMouseMove}
                      onTouchEnd={stopDragging}
                      style={{ touchAction: 'none' }}
                    >
                      <div 
                        className="w-full h-full flex items-center justify-center transition-transform duration-100 ease-out"
                        style={{ 
                          transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
                          transformOrigin: 'center'
                        }}
                      >
                        <img 
                          src={currentRecord.imageUrl} 
                          alt="Source" 
                          className="max-w-full max-h-full object-contain pointer-events-none" 
                        />
                      </div>
                    </div>
                  </div>

                  {/* Zoom Controls */}
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                    <div className="flex items-center justify-between text-xs font-black text-slate-400 uppercase tracking-widest">
                      <span>Magnification</span>
                      <button 
                        onClick={() => { setZoomLevel(1); setPanOffset({x:0, y:0}); }}
                        className="text-indigo-600 hover:text-indigo-800 transition-colors"
                      >
                        Reset
                      </button>
                    </div>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => setZoomLevel(prev => Math.max(1, prev - 0.5))}
                        className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50"
                      >
                        -
                      </button>
                      <input 
                        type="range" 
                        min="1" 
                        max="5" 
                        step="0.1" 
                        value={zoomLevel}
                        onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
                        className="flex-1 h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      />
                      <button 
                        onClick={() => setZoomLevel(prev => Math.min(5, prev + 0.5))}
                        className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50"
                      >
                        +
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 text-center italic">
                      {zoomLevel > 1 ? 'Click and drag the image to move around.' : 'Zoom in to enable dragging.'}
                    </p>
                  </div>

                  <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100">
                    <p className="text-xs text-slate-700 leading-relaxed italic">
                      Verifying <strong>{currentRecord.staffName}</strong>. <br/>
                      <span className="text-indigo-600 font-bold block mt-1">
                        All identified rows (including partial clock-ins) are preserved for export.
                      </span>
                    </p>
                  </div>
                </div>
              </div>

              <div className="lg:w-2/3 space-y-6">
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                  <div className="space-y-6 mb-8">
                    <div className="space-y-1">
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">Staff Name</label>
                      <input
                        type="text"
                        list="staff-suggestions"
                        value={currentRecord.staffName}
                        onChange={(e) => handleUpdateName(e.target.value)}
                        className="w-full text-2xl font-black text-slate-900 border-b-2 border-slate-100 focus:border-indigo-500 focus:outline-none py-2 transition-colors"
                      />
                      <datalist id="staff-suggestions">
                        {staffDatabase.map((s, i) => (
                          <option key={i} value={s.name} />
                        ))}
                      </datalist>
                    </div>
                  </div>

                  <DataTable entries={currentRecord.entries} onUpdate={handleUpdateEntries} />

                  <div className="mt-8 flex flex-wrap justify-end items-center gap-4">
                    <div className="text-right mr-auto sm:mr-0">
                       <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Status</p>
                       <p className="text-sm font-bold text-slate-600">
                         {currentQueueIndex < pendingQueue.length - 1 ? 'Next card ready' : 'Batch complete'}
                       </p>
                    </div>

                    <div className="flex gap-3 w-full sm:w-auto">
                      <input
                        ref={addMoreInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => handleFileUpload(e, true)}
                        className="hidden"
                      />
                      <button
                        onClick={triggerAddMore}
                        disabled={processedPhotosCount >= MAX_PHOTOS}
                        className="flex-1 sm:flex-none px-6 py-3 border-2 border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                        Add Photos ({processedPhotosCount}/{MAX_PHOTOS})
                      </button>

                      <button
                        onClick={saveAndNext}
                        className="flex-1 sm:flex-none px-8 py-3 bg-indigo-600 text-white font-black rounded-xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                      >
                        {currentQueueIndex < pendingQueue.length - 1 ? 'Save & Next' : 'Finish & Save'}
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {!currentRecord && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 md:hidden z-40">
          <label className="w-full py-3 bg-indigo-600 text-white font-black rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-lg active:scale-95 transition-transform">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            Batch Upload
            <input type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={(e) => handleFileUpload(e, false)} />
          </label>
        </div>
      )}
    </div>
  );
}
