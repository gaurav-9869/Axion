const fs = require('fs');
let code = fs.readFileSync('src/components/ArchiveView.tsx', 'utf8');

const editFormExtras = `
                                        </div>
                                        <div className="flex flex-col gap-3 mt-1">
                                            <div className="flex flex-col gap-1">
                                                <label className="text-[10px] uppercase text-zinc-400 font-bold">Friction Analysis</label>
                                                <textarea value={editFormData.frictionAnalysis || ''} onChange={e => setEditFormData({ ...editFormData, frictionAnalysis: e.target.value })} className="bg-black/40 border border-white/10 rounded-lg p-2 text-sm text-white outline-none min-h-[60px]" placeholder="Note any friction points..." />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <label className="text-[10px] uppercase text-zinc-400 font-bold">Notes</label>
                                                <textarea value={editFormData.notes || ''} onChange={e => setEditFormData({ ...editFormData, notes: e.target.value })} className="bg-black/40 border border-white/10 rounded-lg p-2 text-sm text-white outline-none min-h-[60px]" placeholder="General session notes..." />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <label className="text-[10px] uppercase text-zinc-400 font-bold text-amber-400/80">System Refinement</label>
                                                <textarea value={editFormData.systemRefinement || ''} onChange={e => setEditFormData({ ...editFormData, systemRefinement: e.target.value })} className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 text-sm text-amber-100 outline-none min-h-[60px] focus:border-amber-500/50" placeholder="Did you refine your system?" />
                                            </div>
                                        </div>
                                        <div className="flex gap-2 justify-end mt-2">
`;

code = code.replace("                                        </div>\n                                        <div className=\"flex gap-2 justify-end mt-2\">", editFormExtras);

const addDetailsBtn = `
                                        {log.systemRefinement && (
                                           <div className="mt-1 p-3 bg-amber-500/5 rounded-xl border border-amber-500/10 text-sm text-amber-100/80 italic">
                                               <strong className="text-amber-400 text-xs uppercase tracking-wider block mb-1">System Refinement</strong>
                                               "{log.systemRefinement}"
                                           </div>
                                        )}
                                        
                                        {(!log.systemRefinement || !log.notes || !log.frictionAnalysis) && (
                                            <div 
                                                onClick={() => { setEditingLogId(log.id); setEditFormData({ ...log }); }}
                                                className="mt-2 flex items-center gap-2 p-2.5 rounded-xl border border-dashed border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer group w-max"
                                            >
                                                <span className="material-symbols-outlined text-[16px] group-hover:text-amber-400 transition-colors">add_circle</span>
                                                Add missing { [!log.systemRefinement ? 'System Refinement' : null, !log.notes ? 'Notes' : null, !log.frictionAnalysis ? 'Friction Analysis' : null].filter(Boolean).join(', ') }
                                            </div>
                                        )}
`;

code = code.replace(`                                        {log.systemRefinement && (
                                           <div className="mt-1 p-3 bg-amber-500/5 rounded-xl border border-amber-500/10 text-sm text-amber-100/80 italic">
                                               <strong className="text-amber-400 text-xs uppercase tracking-wider block mb-1">System Refinement</strong>
                                               "{log.systemRefinement}"
                                           </div>
                                        )}`, addDetailsBtn);

fs.writeFileSync('src/components/ArchiveView.tsx', code);
