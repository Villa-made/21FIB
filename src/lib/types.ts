// DTOs del contrato API v1 (docs/design/api-contracts.md). No añadir campos que el contrato no define.

export type ActionType = 'RECYCLING' | 'LITTER_COLLECTION';

export type ContributionStatus =
  | 'PENDING'
  | 'NEEDS_EVIDENCE'
  | 'TECHNICAL_ERROR'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export type CaptureOrigin = 'GALLERY' | 'CAMERA_FLOW';

export interface ApiErrorBody {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface Municipality {
  code: string;
  name: string;
  provinceName?: string;
}

export interface UploadTicket {
  photoPath: string;
  uploadToken: string;
  expiresAt: string;
}

export interface CreateContributionRequest {
  actionType: ActionType;
  description: string;
  municipalityCode: string;
  photoPath: string;
  captureOrigin: CaptureOrigin;
}

export interface CreateContributionResponse {
  id: string;
  status: 'PENDING';
  submittedAt: string;
  pointsIfApproved: number;
}

export interface OwnContribution {
  id: string;
  actionType: ActionType;
  status: ContributionStatus;
  reason: string | null;
  submittedAt: string;
  approvedAt: string | null;
  isHidden: boolean;
  effectivePoints: number;
  canRetry: boolean;
  canProvideEvidence: boolean;
  canCancel: boolean;
}

export interface FeedItem {
  id: string;
  authorAlias: string;
  actionType: ActionType;
  description: string;
  municipality: Municipality;
  imageUrl: string;
  publishedAt: string;
  likeCount: number;
  likedByMe: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  alias: string;
  points: number;
}

/** Solo para mostrar en la UI; los puntos reales los decide siempre el servidor. */
export const ACTION_LABELS: Record<ActionType, { label: string; points: number; emoji: string }> = {
  RECYCLING: { label: 'Reciclar', points: 10, emoji: '♻️' },
  LITTER_COLLECTION: { label: 'Recoger residuos', points: 20, emoji: '🧹' },
};
