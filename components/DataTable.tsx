
import React from 'react';
import { PunchEntry } from '../types';

interface DataTableProps {
  entries: PunchEntry[];
  onUpdate: (updatedEntries: PunchEntry[]) => void;
}

export const DataTable: React.FC<DataTableProps> = ({ entries, onUpdate }) => {
  const handleChange = (index: number, field: keyof PunchEntry, value: string) => {
    const newEntries = [...entries];
    newEntries[index] = { ...newEntries[index], [field]: value };
    onUpdate(newEntries);
  };

  return (
    <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Date (yyyy/mm/dd)</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Time In</th>
            <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Time Out</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-slate-200">
          {entries.map((entry, idx) => (
            <tr key={idx} className="hover:bg-slate-50 transition-colors">
              <td className="px-4 py-2 whitespace-nowrap">
                <input
                  type="text"
                  value={entry.date}
                  onChange={(e) => handleChange(idx, 'date', e.target.value)}
                  className="w-full bg-transparent border-none focus:ring-2 focus:ring-blue-500 rounded p-1 text-sm text-slate-700 font-mono"
                />
              </td>
              <td className="px-4 py-2 whitespace-nowrap">
                <input
                  type="text"
                  value={entry.timeIn}
                  onChange={(e) => handleChange(idx, 'timeIn', e.target.value)}
                  className="w-full bg-transparent border-none focus:ring-2 focus:ring-blue-500 rounded p-1 text-sm text-slate-700"
                />
              </td>
              <td className="px-4 py-2 whitespace-nowrap">
                <input
                  type="text"
                  value={entry.timeOut}
                  onChange={(e) => handleChange(idx, 'timeOut', e.target.value)}
                  className="w-full bg-transparent border-none focus:ring-2 focus:ring-blue-500 rounded p-1 text-sm text-slate-700"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
