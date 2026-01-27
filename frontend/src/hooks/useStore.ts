import { create } from 'zustand';
import type { AppState } from '../types';

export const useStore = create<AppState>((set) => ({
  token: sessionStorage.getItem('claude_token'),
  setToken: (token) => {
    if (token) {
      sessionStorage.setItem('claude_token', token);
    } else {
      sessionStorage.removeItem('claude_token');
    }
    set({ token });
  },

  scan: null,
  setScan: (scan) => set({ scan, currentSlice: 0, selectedSlices: [], annotations: [] }),

  folderScan: null,
  setFolderScan: (folderScan) => set({ folderScan }),

  currentSlice: 0,
  setCurrentSlice: (currentSlice) => set({ currentSlice }),

  selectedSlices: [],
  setSelectedSlices: (selectedSlices) => set({ selectedSlices }),
  toggleSliceSelection: (index) =>
    set((state) => {
      const selected = state.selectedSlices.includes(index)
        ? state.selectedSlices.filter((i) => i !== index)
        : [...state.selectedSlices, index].sort((a, b) => a - b);
      return { selectedSlices: selected };
    }),

  messages: [],
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  clearMessages: () => set({ messages: [], annotations: [] }),

  annotations: [],
  setAnnotations: (annotations) => set({ annotations }),
  addAnnotations: (newAnnotations) =>
    set((state) => ({ annotations: [...state.annotations, ...newAnnotations] })),

  modelInfo: null,
  setModelInfo: (modelInfo) => set({ modelInfo }),

  isLoading: false,
  setIsLoading: (isLoading) => set({ isLoading }),

  error: null,
  setError: (error) => set({ error }),
}));
