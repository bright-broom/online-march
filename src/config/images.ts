/**
 * Curated stock imagery (Unsplash License). Keys are referenced from config/content & seed.
 * Replace with the farm's own photos by uploading in the dashboard — these are defaults only.
 */
const u = (id: string) => `https://images.unsplash.com/${id}`;

export const images = {
  // landscape / Awaji
  heroSunset: u("photo-1701839241469-7a7406d79661"),
  akashiBridge: u("photo-1741044320008-5bc22e166d0b"),
  setoSea: u("photo-1699031840949-a81e2c58ac85"),
  setoIslands: u("photo-1726537625265-886486fe2827"),
  fieldRows: u("photo-1560493676-04071c5f467b"),
  fieldCloudy: u("photo-1694872581803-b279e7a63f7f"),
  onionPlants: u("photo-1687365301009-af603af2a8a9"),
  onionSprout: u("photo-1714425396242-915d4093800a"),
  planting: u("photo-1597916829826-02e5bb4a54e0"),
  farmersField: u("photo-1734359177779-65e1beba0b26"),
  farmerWork: u("photo-1760549255949-767d18981890"),
  // onions
  onionGolden: u("photo-1741517480859-cc010cff7e6a"),
  onionGolden2: u("photo-1741517480900-8bee5b4f48df"),
  onionGolden3: u("photo-1741517481122-51d958803203"),
  onionYellow: u("photo-1518977956812-cd3dbadaaf31"),
  onionPile: u("photo-1597937081593-0ddc5f66deb0"),
  onionPile2: u("photo-1706661191268-f9b24744cb71"),
  onionPile3: u("photo-1720240462804-6b4216e1ac5e"),
  onionLeaf: u("photo-1714560560652-e923cb9e30c1"),
  onionMixed: u("photo-1667720250309-abf176d77333"),
  onionMixedDark: u("photo-1508747703725-719777637510"),
  onionSingle: u("photo-1587735243474-5426387356db"),
  onionPair: u("photo-1587049633312-d628ae50a8ae"),
  onionBasket: u("photo-1678954157284-49ac98f2ae9d"),
  onionBasket2: u("photo-1678954157574-cbbed4d055ab"),
  onionRed: u("photo-1467019972079-a273e1bc9173"),
  onionRedCrate: u("photo-1605197378298-02bf0af1c896"),
  onionRedTray: u("photo-1620574387735-3624d75b2dbc"),
  onionRedPile: u("photo-1668295037469-8b0e8d11cd2a"),
  onionRedSliced: u("photo-1575475240735-0b191257c762"),
  onionSoup: u("photo-1711915408198-9cac70d045c7"),
  onionSoup2: u("photo-1711915408248-e30b20613316"),
  onionSoupFrench: u("photo-1549203438-a7696aed4dac"),
  onionRings: u("photo-1639024471283-03518883512d"),
  shallots: u("photo-1789309404257-ea86467139fc"),
} as const;

export type ImageKey = keyof typeof images;

/** Hosts allowed by next/image (mirrored in next.config.ts). */
export const remoteImageHosts = ["images.unsplash.com", "*.public.blob.vercel-storage.com"] as const;
