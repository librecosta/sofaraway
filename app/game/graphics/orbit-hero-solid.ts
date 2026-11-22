/** Fixed, bounded solid descriptions for ORBIT's five hero families. Negative
 * distance is rock; finite cutters create actual voids, walls and overhangs.
 * No sphere mesh is displaced and no render clock participates in construction. */
export type HeroRegion = 'weathered'|'shear'|'fault'|'exfoliation'|'floor'|'rim';
export type HeroSolid = {
  distance:(x:number,y:number,z:number)=>number;
  region:(x:number,y:number,z:number)=>HeroRegion;
};
type Plane=readonly [number,number,number,number];
type Ring=readonly [number,number,number,number,number]; // y, rx, rz, cx, cz
const fixed=(distance:HeroSolid['distance'],region:HeroRegion):HeroSolid=>({distance,region:()=>region});
function planes(rows:readonly Plane[],region:HeroRegion='shear'):HeroSolid {
  const normalized=rows.map(([x,y,z,d])=>{const n=Math.hypot(x,y,z);return [x/n,y/n,z/n,d/n];});
  return fixed((x,y,z)=>{let distance=-Infinity;for(const [a,b,c,d]of normalized)distance=Math.max(distance,a*x+b*y+c*z-d);return distance;},region);
}
function combine(a:HeroSolid,b:HeroSolid,operation:'union'|'cut'|'intersect'):HeroSolid {
  const choose=(x:number,y:number,z:number)=>{
    const da=a.distance(x,y,z),db=b.distance(x,y,z);
    return operation==='union'?db<da:operation==='cut'?-db>da:db>da;
  };
  return {
    distance:(x,y,z)=>operation==='union'?Math.min(a.distance(x,y,z),b.distance(x,y,z)):
      Math.max(a.distance(x,y,z),(operation==='cut'?-1:1)*b.distance(x,y,z)),
    region:(x,y,z)=>choose(x,y,z)?b.region(x,y,z):a.region(x,y,z),
  };
}
const cut=(a:HeroSolid,b:HeroSolid)=>combine(a,b,'cut');
const intersect=(a:HeroSolid,b:HeroSolid)=>combine(a,b,'intersect');
const union=(a:HeroSolid,b:HeroSolid)=>combine(a,b,'union');
const sectionFaces=[[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[.74,.67,1.13],[-.68,.74,1.12],[.63,-.78,1.18],[-.78,-.63,1.08]];
function loft(rings:readonly Ring[]):HeroSolid {
  return fracturedCoordinates(fixed((x,y,z)=>{
    let i=0;while(i<rings.length-2&&y>rings[i+1][0])i++;
    const a=rings[i],b=rings[i+1],t=Math.max(0,Math.min(1,(y-a[0])/(b[0]-a[0])));
    const rx=a[1]+(b[1]-a[1])*t,rz=a[2]+(b[2]-a[2])*t;
    const qx=(x-a[3]-(b[3]-a[3])*t)/rx,qz=(z-a[4]-(b[4]-a[4])*t)/rz;
    let d=Math.max(rings[0][0]-y,y-rings.at(-1)![0]);
    for(const [nx,nz,r]of sectionFaces)d=Math.max(d,(nx*qx+nz*qz-r)*Math.min(rx,rz));
    return d;
  },'weathered'),Math.round(Math.abs(rings[0][0])*100));
}
function ellipsoid(cx:number,cy:number,cz:number,rx:number,ry:number,rz:number,region:HeroRegion):HeroSolid {
  return fixed((x,y,z)=>(Math.hypot((x-cx)/rx,(y-cy)/ry,(z-cz)/rz)-1)*Math.min(rx,ry,rz),region);
}
function plate(x0:number,x1:number,y0:number,y1:number,z0:number,z1:number,tilt:number):HeroSolid {
  return planes([[1,-tilt,0,x1],[-1,tilt,0,-x0],[0,1,.08,y1],[0,-1,-.08,-y0],
    [0,0,-1,-z0],[.28+tilt,.18-tilt*2,1,z1],[1,.35,.30,x1+.12],[-.7,-.2,.5,-x0+.14],
    [.24,1,.22,y1+.025],[-.18,-1,.14,-y0+.035]],'shear');
}

/** Bounded block displacement breaks up the mother-rock facets.
 * Explicit finite cutters retain ownership of the faults and shear faces. */
function blockOffset(x:number,y:number,z:number,seed:number):number {
  const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);
  const fade=(t:number)=>t*t*(3-2*t),u=fade(x-ix),v=fade(y-iy),w=fade(z-iz);
  let value=0;
  for(let k=0;k<2;k++)for(let j=0;j<2;j++)for(let i=0;i<2;i++) {
    let hash=Math.imul(ix+i,73856093)^Math.imul(iy+j,19349663)^Math.imul(iz+k,83492791)^seed;
    hash=Math.imul(hash^(hash>>>16),0x45d9f3b);hash^=hash>>>16;
    value+=((hash>>>0)/4294967295*2-1)*(i?u:1-u)*(j?v:1-v)*(k?w:1-w);
  }
  return value;
}
function fracturedCoordinates(solid:HeroSolid,shape:number):HeroSolid {
  const point=(x:number,y:number,z:number)=>[
    x+.042*blockOffset(x*3.1,y*4.2,z*3.7,971+shape),
    y+.028*blockOffset(x*4.7,y*2.8,z*3.4,1327+shape),
    z+.050*blockOffset(x*4.1,y*3.5,z*2.9,2399+shape),
  ] as const;
  return {distance:(x,y,z)=>solid.distance(...point(x,y,z)),region:(x,y,z)=>solid.region(...point(x,y,z))};
}

function build(shape:number):HeroSolid {
  let solid:HeroSolid;
  if(shape===0){
    solid=loft([[-.81,.14,.26,-.02,-.10],[-.64,.35,.57,-.09,-.12],[-.24,.44,.68,.00,-.13],
      [.20,.46,.67,.03,-.10],[.57,.33,.48,.13,-.05],[.81,.11,.19,.12,-.04]]);
    // Two unequal faces meet across an open, variable-width fault valley.
    solid=intersect(solid,planes([[0,-.13,1,.50],[.24,-.19,1,.51]],'shear'));
    const fault=fixed((x,y,z)=>{
      const bend=y<-.18?-.045+.04*y:y<.24?-.020+.17*y:.10-.30*y;
      const taper=Math.max(0,Math.min(1,(y+.62)/.21,(.69-y)/.19));
      const width=(.065+.025*Math.max(0,.22-y))*taper;
      return Math.max(Math.abs(x+.13*y-bend)-width,-z+.015+.16*y,Math.abs(y-.04)-.65);
    },'fault');
    solid=cut(solid,fault);
    solid=cut(solid,planes([[1,.20,-.10,-.14],[0,-1,0,.48],[0,0,-1,-.24]],'shear'));
    // An undercut skin plate is attached along its lower root and inner edge.
    solid=cut(solid,planes([[-1,0,0,-.15],[0,1,0,-.12],[0,-1,0,.53],[0,0,1,.34],[0,0,-1,-.25]],'exfoliation'));
    solid=cut(solid,planes([[-1,-.6,0,-.46],[0,0,-1,-.30]],'shear'));
  } else if(shape===1){
    // One continuous angular loft: unequal lobes, oblique neck, no sphere union.
    solid=loft([[-.68,.09,.15,-.21,.02],[-.52,.37,.49,-.19,-.04],[-.29,.43,.55,-.13,.00],
      [-.06,.23,.25,-.03,.02],[.13,.35,.39,.04,.04],[.40,.59,.62,.10,.02],[.62,.36,.42,.13,.03],[.68,.10,.17,.10,.02]]);
    solid=intersect(solid,planes([[.34,.12,1,.65],[-.30,-.15,-1,.62],[-.48,.17,1,.68],[.54,-.34,.75,.64]],'shear'));
    solid=cut(solid,planes([[0,1,.20,.07],[0,-1,-.20,.17],[0,0,-1,-.17],[1,0,0,.30],[-1,0,0,.34]],'fault'));
    solid=cut(solid,planes([[1,.38,0,-.17],[0,1,0,.32],[0,-1,0,.53],[0,0,-1,-.25]],'exfoliation'));
    solid=cut(solid,planes([[-.7,-.5,-.4,-.53]],'shear'));
  } else if(shape===2){
    const back=loft([[-.65,.12,.24,.02,-.22],[-.49,.39,.48,-.01,-.34],[.15,.48,.48,.07,-.30],[.52,.33,.37,.19,-.19],[.65,.10,.19,.20,-.12]]);
    // Thick, offset slabs share a substantial rear spine. Recessed interfaces
    // leave real overhangs instead of painted parallel strata.
    solid=union(back,plate(-.40,.48,-.60,-.21,-.62,.43,.07));
    solid=union(solid,plate(-.34,.66,-.23,.19,-.66,.59,-.10));
    solid=union(solid,plate(-.18,.57,.18,.60,-.56,.46,.15));
    solid=cut(solid,fixed((x,y,z)=>{
      const ledge=-.23-.10*z+(x<-.05?.13*x:-.06*x);
      return Math.max(Math.abs(y-ledge)-(.065+.018*Math.max(0,x)),.12+.10*x-z);
    },'exfoliation'));
    solid=cut(solid,fixed((x,y,z)=>{
      const ledge=.185+.14*z+(x<.20?-.10*x:.18*(x-.20)-.02);
      return Math.max(Math.abs(y-ledge)-(.090-.018*x),.18-.15*x-z);
    },'exfoliation'));
    solid=cut(solid,planes([[1,.25,0,.29],[-1,-.25,0,-.20],[0,0,-1,-.10],[0,-1,0,.51],[0,1,0,-.10]],'fault'));
    solid=cut(solid,planes([[-1,-.6,-.2,-.55]],'shear'));
    solid=cut(solid,planes([[1,.8,.6,-.42]],'shear'));
  } else if(shape===3){
    solid=loft([[-.62,.13,.24,-.08,-.12],[-.47,.51,.62,-.05,-.11],[-.12,.66,.75,.02,-.08],
      [.28,.63,.76,.01,-.06],[.52,.44,.54,.04,-.01],[.62,.14,.20,.05,.02]]);
    // Excavated bowl: deep floor, steeper walls and an incomplete raised rim.
    const face=fixed((x,y,z)=>{
      const r=Math.hypot((x-.17)/.34,(y-.13)/.30);
      const rim=Math.max(0,1-Math.abs(r-1.06)/.23)*(.75+.25*Math.max(0,-x));
      return z-(.61+.08*rim-.09*x+.04*y);
    },'rim');
    solid=intersect(solid,face);
    solid=cut(solid,ellipsoid(.17,.13,.68,.34,.30,.48,'floor'));
    solid=cut(solid,planes([[-1,.34,0,-.38],[0,-1,0,-.23],[0,0,-1,-.48]],'shear'));
    solid=cut(solid,ellipsoid(-.36,-.27,.63,.16,.14,.22,'floor'));
    solid=cut(solid,planes([[-1,-.44,0,-.43],[0,-1,0,-.12],[0,0,-1,-.36]],'fault'));
    solid=cut(solid,planes([[1,-.65,0,-.05],[0,1,0,-.25],[0,0,-1,-.40]],'shear'));
  } else {
    solid=loft([[-.83,.055,.085,.02,.00],[-.66,.17,.24,-.05,.03],[-.25,.22,.29,-.02,.06],
      [.18,.19,.30,.04,.09],[.59,.14,.20,.09,.05],[.83,.045,.08,.10,.01]]);
    solid=intersect(solid,planes([[1,-.11,.26,.22],[-1,.06,-.18,.24],[.28,-.10,1,.35]],'shear'));
    solid=cut(solid,planes([[1,.2,0,.08],[-1,-.2,0,.015],[0,0,-1,-.10],[0,1,0,.54],[0,-1,0,.45]],'fault'));
    solid=cut(solid,planes([[1,.9,-.2,-.50]],'shear'));
    solid=cut(solid,planes([[-1,-.65,-.3,-.43]],'shear'));
    solid=cut(solid,planes([[-1,0,0,-.04],[0,1,0,-.28],[0,-1,0,.60],[0,0,1,.18],[0,0,-1,-.10]],'exfoliation'));
  }
  // A real intersection, not post-hoc vertex clamping or per-LOD rescaling.
  return intersect(solid,fixed((x,y,z)=>Math.hypot(x,y,z)-.98,'weathered'));
}
export const heroSolids=Array.from({length:5},(_,shape)=>build(shape));
export const heroDomains:readonly (readonly [number,number,number,number,number,number])[]=[
  [-.66,-.90,-.94,.73,.90,.70],[-.76,-.77,-.79,.83,.77,.83],[-.56,-.75,-.94,.84,.75,.76],
  [-.82,-.72,-.94,.83,.73,.84],[-.40,-.93,-.38,.42,.93,.53],
];
