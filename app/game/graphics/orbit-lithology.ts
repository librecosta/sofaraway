/** Artistic surface classes informed by Bennu boulder morphology. Values are
 * rendering weights, not a reconstruction of measured Bennu reflectance. */
export const asteroidLithologies = [
  { name:'Clastic porous', fracture:.28, clast:.85, pit:.40, roughness:.96, albedo:.94 },
  { name:'Polygonally fractured', fracture:.85, clast:.12, pit:.18, roughness:.91, albedo:.98 },
  { name:'Angular pitted', fracture:.38, clast:.08, pit:.85, roughness:.85, albedo:1.02 },
  { name:'Weathered inclusions', fracture:.18, clast:.38, pit:.25, roughness:.94, albedo:.96 },
] as const;
