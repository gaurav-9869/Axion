import React, { useState, useEffect, useMemo } from 'react';
import { LogItem, getFocusScore, getSubjectConfig } from '../types';
import { getStudyLogs, saveStudyLog } from '../services/dbService';
import { sound } from '../utils/sound';
import { db, auth, collection, getDocs, query, orderBy, limit } from '../firebase';
import { startAfter } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

export default function ArchiveView() {
  const [loadedLogs, setLoadedLogs] = useState<LogItem[]>([]);
  const [lastDocSnapshot, setLastDocSnapshot] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('newest');
  
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<LogItem | null>(null);

  const fetchLogs = async (isFirstPage = false) => {
    if (!auth.currentUser) return;
    setLoading(true);
    const uid = auth.currentUser.uid;
    try {
      let q = query(
        collection(db, 'users', uid, 'logs'),
        orderBy('timestamp', 'desc'),
        limit(20)
      );
      if (!isFirstPage && lastDocSnapshot) {
        q = query(
          collection(db, 'users', uid, 'logs'),
          orderBy('timestamp', 'desc'),
          startAfter(lastDocSnapshot),
          limit(20)
        );
      }

      const snap = await getDocs(q);
      const newLogs = snap.docs.map(docSnap => {
        const data = docSnap.data() as LogItem;
        return {
          ...data,
          id: docSnap.id
        };
      });

      if (isFirstPage) {
        setLoadedLogs(newLogs);
        if (newLogs.length > 0) {
          let firstDate = 'Unknown';
          const firstLog = newLogs[0];
          if (firstLog.timestamp) {
            firstDate = new Date(firstLog.timestamp).toISOString().split('T')[0];
          } else if (firstLog.nextReviewDate) {
            firstDate = firstLog.nextReviewDate;
          }
          setSelectedDate(firstDate);
        } else {
          setSelectedDate(null);
        }
      } else {
        setLoadedLogs(prev => {
          const combined = [...prev];
          const existingIds = new Set(combined.map(l => l.id));
          newLogs.forEach(l => {
            if (!existingIds.has(l.id)) {
              combined.push(l);
            }
          });
          return combined;
        });
      }

      if (snap.docs.length < 20) {
        setHasMore(false);
      } else {
        setHasMore(true);
        setLastDocSnapshot(snap.docs[snap.docs.length - 1]);
      }
    } catch (err: any) {
      console.error("Failed to fetch paginated logs:", err);
      if (isFirstPage) {
        const dbLogs = await getStudyLogs(20);
        setLoadedLogs(dbLogs);
        setHasMore(false);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        fetchLogs(true);
      } else {
        setLoadedLogs([]);
        setLastDocSnapshot(null);
        setHasMore(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleEditSave = async () => {
    if (!editFormData) return;
    
    setLoadedLogs(prev => prev.map(l => l.id === editFormData.id ? editFormData : l));
    
    try {
      await saveStudyLog(editFormData);
    } catch (err) {
      console.warn("ArchiveView saveStudyLog caught error:", err);
    }
    
    setEditingLogId(null);
    setEditFormData(null);
    sound.playChime();
  };

  const allLogsByDate = useMemo(() => {
    const logData: Record<string, LogItem[]> = {};
    loadedLogs.forEach(log => {
      if (!log) return;
      let dateStr = 'Unknown';
      if (log.timestamp) {
        dateStr = new Date(log.timestamp).toISOString().split('T')[0];
      } else if (log.nextReviewDate) {
        dateStr = log.nextReviewDate;
      }
      if (!logData[dateStr]) logData[dateStr] = [];
      logData[dateStr].push(log);
    });
    return logData;
  }, [loadedLogs]);

  const archivedDates = useMemo(() => {
    return Object.keys(allLogsByDate).sort((a, b) => b.localeCompare(a));
  }, [allLogsByDate]);

  // Filter Engine
  const getFilteredLogsForDate = (dateStr: string): LogItem[] => {
    const logs = allLogsByDate[dateStr] || [];
    return logs.filter(log => {
      const matchesSubject = selectedSubject === 'all' || log.subject === selectedSubject;
      const matchesSearch = searchQuery.trim() === '' || 
        (log.topic && log.topic.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (log.notes && log.notes.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (log.frictionAnalysis && log.frictionAnalysis.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesSubject && matchesSearch;
    });
  };

  const uniqueMonths = Array.from<string>(new Set(
    archivedDates.map(date => date.substring(0, 7))
  )).sort((a, b) => b.localeCompare(a));

  const visibleDates = archivedDates.filter(date => {
    const matchesMonth = selectedMonth === 'all' || date.startsWith(selectedMonth);
    const dayHasValidLogs = getFilteredLogsForDate(date).length > 0;
    return matchesMonth && (searchQuery.trim() === '' || dayHasValidLogs);
  });

  let dynamicDisplayLogs = selectedDate ? getFilteredLogsForDate(selectedDate) : [];
  const isGlobalSearching = searchQuery.trim() !== '';

  if (isGlobalSearching) {
    const combinedStream: (LogItem & { logDate: string })[] = [];
    visibleDates.forEach(date => {
      getFilteredLogsForDate(date).forEach(l => {
        combinedStream.push({ ...l, logDate: date });
      });
    });
    
    if (sortBy === 'newest') combinedStream.sort((a, b) => (b.logDate || '').localeCompare(a.logDate || ''));
    if (sortBy === 'oldest') combinedStream.sort((a, b) => (a.logDate || '').localeCompare(b.logDate || ''));
    if (sortBy === 'focusHigh') combinedStream.sort((a, b) => getFocusScore(b) - getFocusScore(a));
    if (sortBy === 'focusLow') combinedStream.sort((a, b) => getFocusScore(a) - getFocusScore(b));
    
    dynamicDisplayLogs = combinedStream as any;
  } else {
    if (sortBy === 'focusHigh') dynamicDisplayLogs = [...dynamicDisplayLogs].sort((a, b) => getFocusScore(b) - getFocusScore(a));
    if (sortBy === 'focusLow') dynamicDisplayLogs = [...dynamicDisplayLogs].sort((a, b) => getFocusScore(a) - getFocusScore(b));
  }

  // Keep selectedDate synchronized to a valid visible date when filters change
  useEffect(() => {
    if (visibleDates.length > 0 && (!selectedDate || !visibleDates.includes(selectedDate))) {
      setSelectedDate(visibleDates[0]);
    }
  }, [visibleDates, selectedDate]);

  if (!auth.currentUser) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center ios-glass-panel shadow-xl gap-4">
        <span className="material-symbols-outlined text-zinc-500 text-[48px] animate-pulse">lock</span>
        <h3 className="text-lg font-bold text-white">Cloud Authentication Required</h3>
        <p className="text-sm text-zinc-400 max-w-md">
          To view your permanent study archives and historical session logs, please sign in via the <strong>Account</strong> tab.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full text-zinc-100 animate-ios-fade-in">
      {/* Firestore Cloud Sync Header Banner */}
      <div className="w-full flex flex-col sm:flex-row items-start sm:items-center justify-between ios-glass-card-nested p-4 gap-4 border border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <span className="material-symbols-outlined text-[22px]">cloud_done</span>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-white flex items-center gap-2">
              Cloud Firestore Persistent Database
            </span>
            <span className="text-xs text-zinc-400">
              All study logs and session histories are automatically saved to Cloud Firestore and mirrored locally.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Active & Synced
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="ios-glass-panel p-4 flex flex-col gap-4 shadow-xl">
        <div className="flex flex-col md:flex-row gap-3 items-center">
          <div className="w-full md:flex-1 relative">
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search logs, topics, or friction notes..." 
              className="w-full ios-glass-input pl-11 pr-4 py-2.5 text-sm placeholder:text-zinc-500 outline-none"
            />
            <span className="material-symbols-outlined absolute left-3.5 top-2.5 text-zinc-400 text-[20px]">search</span>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 w-full md:w-auto">
            <select 
              value={selectedSubject} 
              onChange={(e) => { setSelectedSubject(e.target.value); sound.playClick(); }} 
              className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-semibold cursor-pointer text-white outline-none"
            >
              <option value="all">All Subjects</option>
              <option value="bio">Biology</option>
              <option value="phys">Physics</option>
              <option value="chem">Chemistry</option>
              <option value="math">Mathematics</option>
            </select>

            <select 
              value={selectedMonth} 
              onChange={(e) => { setSelectedMonth(e.target.value); sound.playClick(); }} 
              className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-semibold cursor-pointer text-white outline-none"
            >
              <option value="all">All Months</option>
              {uniqueMonths.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>

            <select 
              value={sortBy} 
              onChange={(e) => { setSortBy(e.target.value); sound.playClick(); }} 
              className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs font-semibold cursor-pointer text-white outline-none col-span-2 sm:col-span-1"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="focusHigh">Highest Focus</option>
              <option value="focusLow">Lowest Focus</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Content Split Layout */}
      <div className="flex flex-col lg:flex-row gap-6 items-start w-full">
        
        {/* Left Log Directory Index Column */}
        {!isGlobalSearching && (
          <div className="ios-glass-panel p-4 w-full lg:w-64 flex flex-col gap-2 shrink-0 shadow-lg max-h-[60vh] lg:max-h-[75vh] overflow-y-auto">
            <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400 px-3 py-1.5 border-b border-white/10">Logs Directory</h3>
            {visibleDates.length === 0 && <p className="text-zinc-500 text-xs italic p-3">No history found.</p>}
            {visibleDates.map(d => (
              <button 
                key={d} 
                onClick={() => { setSelectedDate(d); sound.playClick(); }}
                className={`px-3 py-2.5 rounded-xl text-left text-sm transition-all flex items-center justify-between font-medium cursor-pointer border ${d === selectedDate ? 'bg-white/15 border-white/30 text-white font-bold shadow-sm' : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-white/5'}`}
              >
                <span>{d}</span>
                <span className="material-symbols-outlined text-[15px] opacity-70">calendar_today</span>
              </button>
            ))}
          </div>
        )}

        {/* Right Session History Panel with Responsive Grid */}
        <div className="ios-glass-panel p-5 flex-1 flex flex-col gap-5 w-full shadow-lg min-w-0">
          <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-400 border-b border-white/10 pb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">folder_open</span>
            {isGlobalSearching ? `Search Results (${dynamicDisplayLogs.length})` : selectedDate ? `Session History: ${selectedDate}` : 'Select Date Log'}
          </h3>
          
          {dynamicDisplayLogs.length === 0 && (
            <div className="p-8 text-center text-zinc-400 text-sm italic font-medium">
              No entries discovered for your active filter constraints.
            </div>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
            {dynamicDisplayLogs.map((log: any) => {
              const conf = getSubjectConfig(log.subject);
              const score = getFocusScore(log);
              let metricsText = '';
              if (log.sessionType === 'Exercise') {
                metricsText = `VSA: ${log.vsaCount || 0} | SA: ${log.saCount || 0} | LA: ${log.laCount || 0}`;
              } else if (log.startPage !== undefined && log.endPage !== undefined) {
                metricsText = `Pages: ${log.startPage} - ${log.endPage}`;
              }

              return (
                <div 
                  key={log.id} 
                  className="ios-glass-card-nested p-4 flex flex-col justify-between gap-3 relative overflow-hidden shadow-md break-words w-full min-w-0 border border-white/10 hover:border-white/20 transition-all"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: conf.color }} />

                  <div className="pl-2 flex flex-col gap-2 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span 
                          className="text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider border"
                          style={{ borderColor: `${conf.color}40`, backgroundColor: `${conf.color}20`, color: conf.color }}
                        >
                          {conf.name}
                        </span>
                        
                        {log.isMissed && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-500/20 text-red-400 border border-red-500/30 uppercase tracking-wider">
                            MISSED
                          </span>
                        )}

                        <span className="text-[10px] font-mono text-zinc-300 bg-black/40 border border-white/5 px-2 py-0.5 rounded-md">
                          {log.sessionType}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-zinc-300 bg-black/40 border border-white/5 px-2 py-0.5 rounded-md">
                          <span style={{ color: conf.color }}>{score}%</span> Efficiency
                        </span>
                        
                        <button 
                          onClick={() => { setEditingLogId(log.id); setEditFormData({ ...log }); sound.playClick(); }} 
                          className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
                          title="Edit Session"
                        >
                          <span className="material-symbols-outlined text-[16px]">edit</span>
                        </button>
                      </div>
                    </div>

                    {editingLogId === log.id && editFormData ? (
                      <div className="flex flex-col gap-3 mt-2 border-t border-white/10 pt-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col gap-1 col-span-2">
                            <label className="text-[10px] uppercase text-zinc-400 font-bold">Topic</label>
                            <input 
                              type="text" 
                              value={editFormData.topic} 
                              onChange={e => setEditFormData({ ...editFormData, topic: e.target.value })} 
                              className="ios-glass-input p-1.5 text-xs text-white outline-none" 
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] uppercase text-zinc-400 font-bold">Study Mins</label>
                            <input 
                              type="number" 
                              value={editFormData.activeMins} 
                              onChange={e => setEditFormData({ ...editFormData, activeMins: Number(e.target.value) })} 
                              className="ios-glass-input p-1.5 text-xs text-white outline-none" 
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] uppercase text-zinc-400 font-bold">Distraction Mins</label>
                            <input 
                              type="number" 
                              value={editFormData.distractionMins} 
                              onChange={e => setEditFormData({ ...editFormData, distractionMins: Number(e.target.value) })} 
                              className="ios-glass-input p-1.5 text-xs text-white outline-none" 
                            />
                          </div>
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] uppercase text-zinc-400 font-bold">Notes</label>
                          <textarea 
                            value={editFormData.notes || ''} 
                            onChange={e => setEditFormData({ ...editFormData, notes: e.target.value })} 
                            className="ios-glass-input p-1.5 text-xs text-white outline-none min-h-[50px]" 
                          />
                        </div>

                        <div className="flex gap-2 justify-end mt-1">
                          <button 
                            onClick={() => setEditingLogId(null)} 
                            className="px-3 py-1 text-xs font-bold bg-white/10 hover:bg-white/15 rounded-lg cursor-pointer transition-colors"
                          >
                            Cancel
                          </button>
                          <button 
                            onClick={handleEditSave} 
                            className="px-3 py-1 text-xs font-bold bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded-lg cursor-pointer transition-colors"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <h4 className="text-white font-bold text-base mt-1 leading-tight">{log.topic}</h4>
                        
                        {log.revisionType && (
                          <div className="text-[11px] text-sky-400 font-semibold uppercase tracking-wider">
                            Horizon: {log.revisionType}
                          </div>
                        )}

                        {log.frictionAnalysis && (
                          <div className="p-2.5 bg-amber-500/10 rounded-xl border border-amber-500/20 text-xs text-amber-300 leading-relaxed">
                            <strong className="text-amber-400">Friction:</strong> {log.frictionAnalysis}
                          </div>
                        )}

                        {log.notes && (
                          <div className="p-2.5 bg-black/30 rounded-xl border border-white/5 text-xs text-zinc-300 italic">
                            "{log.notes}"
                          </div>
                        )}

                        {log.systemRefinement && (
                          <div className="p-2.5 bg-amber-500/10 rounded-xl border border-amber-500/20 text-xs text-amber-200 italic">
                            <strong className="text-amber-400 block mb-0.5">Refinement:</strong> "{log.systemRefinement}"
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400 mt-2 border-t border-white/10 pt-2 font-medium">
                          {metricsText && (
                            <span className="flex items-center gap-1 text-zinc-200">
                              <span className="material-symbols-outlined text-[14px] text-zinc-400">menu_book</span> {metricsText}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px] text-zinc-400">timer</span> {log.activeMins}m
                          </span>
                          {log.retentionScore !== undefined && (
                            <span className="flex items-center gap-1 text-amber-300">
                              <span className="material-symbols-outlined text-[14px] text-amber-400">psychology</span> {log.retentionScore}/10
                            </span>
                          )}
                        </div>

                        {log.scratchpadImage && (
                          <div className="mt-2 border border-white/10 bg-black/40 rounded-xl p-1.5 flex flex-col gap-1">
                            <div className="text-[9px] uppercase font-bold text-zinc-400 tracking-wider flex items-center gap-1">
                              <span className="material-symbols-outlined text-[11px]">draw</span> Handwritten Scratchpad
                            </div>
                            <img 
                              src={log.scratchpadImage} 
                              alt="Archived digital sketch drawing" 
                              className="w-full h-auto rounded-lg max-h-32 object-contain bg-zinc-950 border border-white/5" 
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {hasMore && (
            <div className="flex justify-center mt-6">
              <button
                onClick={() => fetchLogs(false)}
                disabled={loading}
                className="px-6 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white font-semibold text-sm cursor-pointer transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="animate-spin material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                    Loading cloud archives...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">expand_more</span>
                    Load More Logs
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
