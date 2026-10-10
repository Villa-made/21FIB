import heroForest from './images/hero_ecotech_forest_telemetry_1791636009584.jpg'
import madridRecycle from './images/feed_recycling_glass_madrid_1791636021718.jpg'
import pirineosCleanup from './images/feed_cleanup_trail_pirineos_1791636034591.jpg'
import valenciaCleanup from './images/feed_cleanup_beach_valencia_1791636046144.jpg'
import bilbaoRecycle from './images/feed_recycling_yellow_bilbao_1791636055831.jpg'

/** Hero full-bleed del landing. */
export const HERO_IMAGE = heroForest

/** Fotos demo EcoTech para feed / fallbacks / fixtures. */
export const SAMPLE_IMAGES = {
  madridRecycle,
  pirineosCleanup,
  valenciaCleanup,
  bilbaoRecycle,
} as const

const RECYCLE_DEMOS = [madridRecycle, bilbaoRecycle] as const
const CLEANUP_DEMOS = [pirineosCleanup, valenciaCleanup] as const

/** Elige una imagen demo estable según id + tipo de acción. */
export function demoImageFor(
  actionType: 'RECYCLING' | 'LITTER_COLLECTION',
  seed = '',
): string {
  const pool = actionType === 'RECYCLING' ? RECYCLE_DEMOS : CLEANUP_DEMOS
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash + seed.charCodeAt(i)) % pool.length
  return pool[hash] ?? pool[0]
}
