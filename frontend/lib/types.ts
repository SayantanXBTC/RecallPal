export interface ConversationSnippet {
  id?:         string;
  transcript:  string;
  topics?:     string[];
  spoken_at:   string;
}

export interface RecognitionMemory {
  relation:              string;
  notes:                 string;
  last_seen:             string;
  age:                   number | null;
  likes:                 string[];
  recent_conversations?: ConversationSnippet[];
}

export interface RecognitionResult {
  status: 'recognized' | 'unknown' | 'no_face' | 'idle' | 'error';
  name: string | null;
  confidence: number;
  memory: RecognitionMemory | null;
  suggestion: string | null;
}

export interface Person {
  name: string;
  relation: string;
  notes: string;
  age: number | null;
  likes: string[];
  embeddings_count: number;
}

export interface HealthStatus {
  status: string;
  face_db_loaded: boolean;
  people_count: number;
  memory_backend: string;
}

export interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export interface FaceBbox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FaceResult {
  status: 'recognized' | 'unknown';
  name: string | null;
  confidence: number;
  memory: RecognitionMemory | null;
  suggestion: string | null;
  bbox: FaceBbox;
  frame_width: number;
  frame_height: number;
  /** Stable client-side identity assigned by CameraPanel via IoU tracking. */
  trackId?: number;
}

export interface MultiRecognitionResult {
  faces: FaceResult[];
}

export interface RecognitionEvent {
  id: string;
  person_name: string;
  confidence: number;
  recognized_at: string;
}

export interface VisitorSummaryEntry {
  person_name: string;
  relation:    string;
  notes:       string;
  likes:       string[];
  visit_count: number;
  first_seen:  string | null;   // ISO-8601 or null
  last_seen:   string | null;   // ISO-8601 or null
}

export interface DailySummary {
  date:            string;  // YYYY-MM-DD
  total_visitors:  number;
  visitors:        VisitorSummaryEntry[];
}
