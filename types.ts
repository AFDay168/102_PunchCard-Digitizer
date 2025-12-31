
export interface PunchEntry {
  date: string; // yyyy/mm/dd
  timeIn: string;
  timeOut: string;
}

export interface PunchCardData {
  id: string;
  staffName: string;
  entries: PunchEntry[];
  imageUrl: string;
  confidence: number;
}

export interface NameMapping {
  extracted: string;
  corrected: string;
}

export interface StaffInfo {
  name: string;
  wage: number | string;
  effectiveDate: string;
}

export enum ProcessingStatus {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  ANALYZING = 'ANALYZING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}
