import { checkGalleryDate, parseExifDate } from './photo';

const now = new Date(2026, 9, 10, 12, 0, 0);
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

describe('checkGalleryDate (feedback temprano de RQ-22/25)', () => {
  it('acepta fotos de 59 y 60 minutos', () => {
    expect(checkGalleryDate(minutesAgo(59), now)).toEqual({ ok: true });
    expect(checkGalleryDate(minutesAgo(60), now)).toEqual({ ok: true });
  });
  it('rechaza fotos de 61 minutos', () => {
    expect(checkGalleryDate(minutesAgo(61), now)).toEqual({ ok: false, reason: 'TOO_OLD' });
  });
  it('rechaza fechas futuras y ausencia de EXIF', () => {
    expect(checkGalleryDate(minutesAgo(-10), now)).toEqual({ ok: false, reason: 'FUTURE' });
    expect(checkGalleryDate(null, now)).toEqual({ ok: false, reason: 'NO_EXIF' });
  });
});

describe('parseExifDate', () => {
  it('parsea el formato EXIF', () => {
    expect(parseExifDate('2026:10:10 11:30:05')).toEqual(new Date(2026, 9, 10, 11, 30, 5));
  });
  it('devuelve null con datos inválidos', () => {
    expect(parseExifDate('garbage')).toBeNull();
  });
});
