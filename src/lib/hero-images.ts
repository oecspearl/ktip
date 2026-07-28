export const FALLBACK_IMAGE = '/ktiphero.png'

// Pool of stock hero images assigned to items that have no image of their own.
// The pick is a stable hash of the seed so each page/card keeps its image
// across renders instead of reshuffling.
export const HERO_IMAGES = [
  '/hero/hero-1.jpg',
  '/hero/hero-2.jpg',
  '/hero/hero-3.jpg',
  '/hero/hero-4.jpg',
  '/hero/hero-5.jpg',
  '/hero/hero-6.jpg',
]

export const heroImageFor = (seed: string) => {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return HERO_IMAGES[h % HERO_IMAGES.length]
}

// Brand color washes matching the homepage bento grid, picked by the same
// stable hash so a card keeps its wash across renders.
export const BENTO_GRADIENTS = [
  'from-[#041E42] via-[#163A63]/70 to-[#2A5788]/10',
  'from-[#2C4100] via-[#5E8A00]/70 to-[#97D700]/10',
  'from-[#020F21] via-[#041E42]/70 to-[#4F7AAE]/10',
  'from-[#806000] via-[#B38500]/70 to-[#FFC72C]/10',
  'from-[#163A63] via-[#2A5788]/70 to-[#7AB000]/10',
  'from-[#4D3900] via-[#E6AC09]/70 to-[#FFD75C]/10',
  'from-[#446400] via-[#7AB000]/70 to-[#AEE12B]/10',
]

export const gradientFor = (seed: string) => {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return BENTO_GRADIENTS[h % BENTO_GRADIENTS.length]
}
