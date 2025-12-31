
import React from 'react';
import { ProcessingStatus } from '../types';

interface ProcessingOverlayProps {
  status: ProcessingStatus;
}

export const ProcessingOverlay: React.FC<ProcessingOverlayProps> = ({ status }) => {
  if (status === ProcessingStatus.IDLE || status === ProcessingStatus.COMPLETED) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
      <div className="text-center p-8 bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-sm w-full mx-4">
        <div className="relative w-20 h-20 mx-auto mb-6">
          <div className="absolute inset-0 border-4 border-blue-100 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
        </div>
        <h3 className="text-xl font-bold text-slate-900 mb-2">
          {status === ProcessingStatus.ANALYZING ? 'Gemini AI is Analyzing...' : 'Uploading Image...'}
        </h3>
        <p className="text-slate-500 text-sm">
          {status === ProcessingStatus.ANALYZING 
            ? 'We are extracting handwritten text and digitizing the punch card data for you.' 
            : 'Transferring your file to the processing engine.'}
        </p>
      </div>
    </div>
  );
};
