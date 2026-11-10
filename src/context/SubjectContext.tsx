import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { SubjectPreference, SubjectConfig, PRESET_COLORS, dynamicSubjects, setDynamicSubjects as setGlobalDynamicSubjects } from '../types';
import { getSubjectPreferences, saveSubjectPreferences } from '../services/dbService';

interface SubjectContextType {
  subjects: SubjectPreference[];
  setSubjects: React.Dispatch<React.SetStateAction<SubjectPreference[]>>;
  updateSubjectPreferences: (newSubjects: SubjectPreference[]) => Promise<void>;
  getSubjectConfig: (subKey: string | undefined) => SubjectConfig;
}

const SubjectContext = createContext<SubjectContextType | null>(null);

export const SubjectProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [subjects, setSubjects] = useState<SubjectPreference[]>(() => [...dynamicSubjects]);

  // Load saved preferences on mount
  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const prefs = await getSubjectPreferences();
        if (prefs && prefs.length > 0 && isMounted) {
          setSubjects(prefs);
          setGlobalDynamicSubjects(prefs);
        }
      } catch (err) {
        console.warn("SubjectProvider load preferences error:", err);
      }
    }
    load();

    // Listen to custom cross-component update events if any
    const handleSync = (e: CustomEvent<SubjectPreference[]>) => {
      if (e.detail && Array.isArray(e.detail)) {
        setSubjects(e.detail);
        setGlobalDynamicSubjects(e.detail);
      }
    };
    window.addEventListener('axion-subjects-updated' as any, handleSync as any);

    return () => {
      isMounted = false;
      window.removeEventListener('axion-subjects-updated' as any, handleSync as any);
    };
  }, []);

  const updateSubjectPreferences = useCallback(async (newSubjects: SubjectPreference[]) => {
    setSubjects(newSubjects);
    setGlobalDynamicSubjects(newSubjects);
    window.dispatchEvent(new CustomEvent('axion-subjects-updated', { detail: newSubjects }));
    await saveSubjectPreferences(newSubjects);
  }, []);

  const getSubjectConfig = useCallback((sub: string | undefined): SubjectConfig => {
    if (!sub) {
      return {
        name: 'General Study',
        color: '#64748b',
        bg: 'bg-slate-500/20',
        text: 'text-slate-400',
        border: 'border-slate-500/30'
      };
    }

    const found = subjects.find(s => s.id === sub || s.name.toLowerCase() === sub.toLowerCase());
    if (found) {
      return {
        name: found.name,
        color: found.color,
        bg: found.bg || 'bg-slate-500/20',
        text: found.text || 'text-slate-400',
        border: found.border || 'border-slate-500/30'
      };
    }

    return {
      name: sub.charAt(0).toUpperCase() + sub.slice(1),
      color: '#64748b',
      bg: 'bg-slate-500/20',
      text: 'text-slate-400',
      border: 'border-slate-500/30'
    };
  }, [subjects]);

  return (
    <SubjectContext.Provider value={{ subjects, setSubjects, updateSubjectPreferences, getSubjectConfig }}>
      {children}
    </SubjectContext.Provider>
  );
};

export const useSubjects = (): SubjectContextType => {
  const context = useContext(SubjectContext);
  if (!context) {
    // Fallback safe defaults if used outside provider
    return {
      subjects: dynamicSubjects,
      setSubjects: () => {},
      updateSubjectPreferences: async () => {},
      getSubjectConfig: (sub?: string) => {
        if (!sub) return { name: 'General Study', color: '#64748b', bg: 'bg-slate-500/20', text: 'text-slate-400', border: 'border-slate-500/30' };
        const found = dynamicSubjects.find(s => s.id === sub || s.name.toLowerCase() === sub.toLowerCase());
        if (found) return { name: found.name, color: found.color, bg: found.bg || 'bg-slate-500/20', text: found.text || 'text-slate-400', border: found.border || 'border-slate-500/30' };
        return { name: sub.charAt(0).toUpperCase() + sub.slice(1), color: '#64748b', bg: 'bg-slate-500/20', text: 'text-slate-400', border: 'border-slate-500/30' };
      }
    };
  }
  return context;
};
