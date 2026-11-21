import type { QualityTier } from '../contracts';

/** Large silhouettes keep one surface; tiny fragments switch only at small coverage. */
export function rockDetail(pixels:number,previous:number,quality:QualityTier,radius=0) {
  if(radius>=6)return quality==='low'?1:0;
  const [near,middle]=quality==='low'?[18,5]:quality==='auto'?[21,6]:[24,7];
  if(pixels>=near*(previous===0?.84:1))return 0;
  if(pixels>=middle*(previous===1?.84:1))return 1;
  return 2;
}
