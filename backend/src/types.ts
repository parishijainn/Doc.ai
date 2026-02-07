/**
 * CareZoom data models and API types.
 * All user data treated as sensitive; minimize storage; short retention.
 */

export interface UserProfile {
  id: string;
  ageRange?: string;       // e.g. "65-74"
  conditions?: string[];   // diabetes, heart disease, etc.
  medsList?: string[];    // optional
  allergies?: string[];   // optional
  caregiverContacts?: { email?: string; phone?: string; name?: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface VisitSession {
  id: string;
  userId?: string;
  consentGivenAt?: string;
  tavusConversationId?: string;
  tavusConversationUrl?: string;
  tavusMeetingToken?: string;
  tavusStartedAt?: string;
  transcript: { role: 'user' | 'assistant'; text: string; at: string }[];
  imagesMetadata: { id: string; type: string; uploadedAt: string }[];
  startedAt: string;
  endedAt?: string;
}

export interface TriageResult {
  summary: string;           // "What I understood"
  possibleCauses: string[];   // ranked, conservative
  whatToDoNow: string[];     // safe home care steps
  warningSigns: string[];    // when to seek urgent care
  whoToSee: string;          // PCP vs urgent care vs specialist
  questionsToAsk: string[];
  redFlagsTriggered: boolean;
  emergencyAdvice?: string;  // e.g. "Call 911 now"
}

export interface ProviderResult {
  name: string;
  type: string;   // urgent_care | er | hospital | dermatology | orthopedics | pt | pcp
  address: string;
  lat: number;
  lng: number;
  distanceKm?: number;
  travelTimeMinutes?: number;
  phone?: string;
  openNow?: boolean;
}

export type ImageClassificationType = 'skin' | 'wound' | 'bruise' | 'medication_label' | 'exercise_pose' | 'unknown';

export interface ImageAnalysisResult {
  imageType: ImageClassificationType;
  observations: string[];   // non-diagnostic: "looks inflamed", "visible swelling"
  medicationName?: string;  // if label extracted
  medicationStrength?: string;
  postureTips?: string[];   // for exercise
  disclaimer: string;
}

export interface RouteResult {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  distanceKm: number;
  durationMinutes: number;
  geometry?: number[][];    // [lng, lat] for map polyline
  mode: 'driving' | 'walking';
}
