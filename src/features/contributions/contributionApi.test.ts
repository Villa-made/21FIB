import { ApiError } from '@/lib/api';
import { contributionErrorMessage } from './contributionApi';

describe('contributionErrorMessage', () => {
  it('traduce los códigos de dominio del contrato v1', () => {
    expect(contributionErrorMessage(new ApiError(409, 'PENDING_CONTRIBUTION_EXISTS', 'x'))).toMatch(/en revisión/);
    expect(contributionErrorMessage(new ApiError(422, 'EXIF_REQUIRED', 'x'))).toMatch(/cámara/);
    expect(contributionErrorMessage(new ApiError(422, 'PHOTO_TOO_OLD', 'x'))).toMatch(/60 minutos/);
  });
  it('incluye la hora de fin del cooldown si el servidor la envía', () => {
    const msg = contributionErrorMessage(new ApiError(409, 'COOLDOWN_ACTIVE', 'x', { retryAt: '2026-10-10T10:00:00Z' }));
    expect(msg).toMatch(/Podrás volver a hacerlo a las \d{2}:\d{2}/);
  });
});
