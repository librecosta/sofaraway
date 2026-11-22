import * as THREE from 'three';
import { mergeVertices, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const heroFamilies = ['Fractured Monolith', 'Twin-Lobe Mass', 'Stratified Cliff', 'Impact Scar', 'Elongated Shard'] as const;

const saturate=(v:number)=>Math.max(0,Math.min(1,v));
const transition=(a:number,b:number,v:number)=>{const t=saturate((v-a)/(b-a));return t*t*(3-2*t);};
const patch=(x:number,y:number,z:number,cx:number,cy:number,cz:number,r:number)=>
  saturate(1-((x-cx)**2+(y-cy)**2+(z-cz)**2)/(r*r));

/** Sparse finite faults and detached skin patches, rather than repeating contour bands.
 * Coordinates are the undeformed unit body, so geometry and material masks agree. */
export function heroGeology(shape:number,x:number,y:number,z:number) {
  const face=saturate((z+.12)*2.5),weather=patch(x,y,z,-.30,.25,.68,.80);
  let fault=0,peel=0,impact=0,fresh=0;
  if(shape===0) {
    const cut=x+.20*y-.10,branch=y-.34*x-.22;
    fault=saturate(1-Math.abs(cut)/.055)*patch(x,y,z,.02,.05,.70,.95)*face;
    fault=Math.max(fault,.65*saturate(1-Math.abs(branch)/.045)*patch(x,y,z,-.12,.20,.80,.44));
    peel=patch(x,y,z,.34,-.32,.74,.48);fresh=patch(x,y,z,-.31,.15,.70,.66)*face;
  } else if(shape===1) {
    const neck=patch(x,y,z,-.04,-.05,.78,.56);
    fault=saturate(1-Math.abs(y+.18*x+.10*x*x)/.065)*neck;
    peel=patch(x,y,z,-.34,-.42,.62,.40);fresh=patch(x,y,z,.38,.48,.65,.44);
  } else if(shape===2) {
    // Three unequal, bounded exfoliation edges; never a periodic layer function.
    for(const [level,tilt,cx,r]of [[-.43,.13,-.28,.65],[-.05,-.08,.28,.72],[.48,.19,-.12,.56]]) {
      const region=patch(x,y,z,cx,level,.78,r);
      fault=Math.max(fault,saturate(1-Math.abs(y-level+tilt*x)/.055)*region);
      peel=Math.max(peel,region*saturate((y-level+tilt*x)*7+.5));
    }
    fresh=patch(x,y,z,-.48,-.05,.65,.74)*face;
  } else if(shape===3) {
    const r=Math.hypot(x-.32,y-.22);
    impact=saturate(1-r/.49)*face;
    const rim=saturate(1-Math.abs(r-.46)/.13)*face;
    fault=rim*Math.max(saturate(1-Math.abs(x-.32+.35*(y-.22))/.045),
      saturate(1-Math.abs(y-.22-.62*(x-.32))/.055));
    peel=patch(x,y,z,-.27,-.29,.76,.36);fresh=rim;
  } else {
    fault=saturate(1-Math.abs(x+.12*y-.08)/.05)*patch(x,y,z,.05,.12,.75,.95)*face;
    peel=patch(x,y,z,-.20,-.40,.72,.43);fresh=patch(x,y,z,.36,.03,.65,.68)*face;
  }
  return {fault,peel,impact,fresh:saturate(fresh),weather};
}

/** Finite spalls and cup-shaped excavations, with unequal centres and widths.
 * They are shallow enough to preserve the established body and safety envelope. */
export function heroSpall(shape:number,x:number,y:number,z:number) {
  let depth=0;
  const sites=shape===3 ? [[.38,.36,.82,.27],[.02,-.35,.90,.22],[-.36,.08,.84,.19]]
    :shape===1 ? [[-.35,-.24,.85,.25],[.28,.48,.78,.23],[-.48,.53,-.70,.27]]
    :shape===2 ? [[-.34,.32,.84,.28],[.33,-.28,.83,.32],[.15,.62,-.75,.24]]
    :shape===4 ? [[.24,.42,.86,.24],[-.32,-.28,.86,.29],[.30,-.60,-.72,.22]]
    :[[.28,-.36,.86,.31],[-.30,.48,.81,.25],[-.35,-.16,-.88,.30]];
  for(const [cx,cy,cz,r]of sites) {
    const d2=((x-cx)**2+(y-cy)**2+(z-cz)**2)/(r*r);
    const interior=saturate((1-d2)*5);
    // A chipped lip around a tilted planar flake; the impact family excavates
    // a deeper rounded cup instead. Bounded, non-periodic and stationary.
    const flake=shape===3?saturate(1-d2):saturate(.55+(x-cx)*1.7-(y-cy)*.8);
    depth=Math.max(depth,interior*(.014+.030*flake));
  }
  return depth;
}

/** Broad planes, displaced strata and local excavation, evaluated identically at every LOD. */
export function heroSurface(shape: number, x: number, y: number, z: number, out: THREE.Vector3) {
  const plane = Math.min(1.04, .82 / Math.max(.01, x*.72+y*.23+z*.65),
    .88 / Math.max(.01, -x*.65+y*.62-z*.44));
  const scar = Math.exp(-1*((x-.32)**2*12+(y-.22)**2*8)) * Math.max(0,z);
  let px=x*plane, py=y*plane, pz=z*plane;
  if(shape===0) {
    // Two offset cleavage shelves and a missing shoulder make an asymmetric spire.
    px=px*(.66+.18*y)+.15*y*y;
    const ledge=.09*transition(.24,.32,y)-.10*(1-transition(-.31,-.23,y));
    pz=Math.min(pz,.44+.24*y+ledge)-.17*Math.exp(-1*((y-.25)/.22)**2)*Math.max(0,x);
    py*=1.13; px+=.08*transition(.18,.26,y)-.10*(1-transition(-.28,-.20,y));
  } else if(shape===1) {
    const lobe = .70+.30*Math.pow(Math.abs(y),.48);
    px*=lobe*(y>0?1.05:.73); pz*=lobe;
    px+=.23*y; pz+=.16*y*y; py*=.94;
  } else if(shape===2) {
    const shelf=.2+.4*transition(-.48,-.38,y)+.4*transition(-.10,0,y)+.6*transition(.43,.53,y);
    px=px*.85+.15*shelf; pz=Math.min(pz,.50+.21*shelf);
    py*=.91; px=Math.max(px,-.47+.16*y);
  } else if(shape===3) {
    const rim=Math.exp(-1*((Math.hypot(x-.32,y-.22)-.48)/.12)**2)*Math.max(0,z);
    pz=pz-.55*scar+.17*rim; px*=.96; py*=.86;
  } else {
    px=px*(.38+.13*y)+.12*y*y; pz=pz*(.42+.12*x);
    py*=1.16; px=Math.min(px,.20+.15*y); pz=Math.max(pz,-.20-.18*y);
  }
  // Intersecting broad fault ribs and excavated pockets break the cut surfaces
  // into readable plates. These are world-scale landforms, not surface noise.
  const rib=Math.max(0,1-Math.abs(x-.48*y-.16)*5.2)*Math.max(0,z);
  const cross=Math.max(0,1-Math.abs(y+.32*z+.30)*8.0);
  const pocket=Math.exp(-((x+.33)**2*17+(y-.43)**2*24))*Math.max(0,z);
  pz+=.16*rib-.085*cross-.15*pocket;
  const shoulder=Math.max(0,1-Math.abs(z+.45*x-.12)*6);
  px+=.065*shoulder*(y>0?1:-1);
  const raised=Math.max(0,1-Math.abs(x*.6+y*.8-z*.35-.28)*4.5);
  const fault=Math.max(0,1-Math.abs(-x*.7+y*.4+z*.8+.15)*7);
  const plate=.91+.10*raised-.09*fault;
  px*=plate;py*=plate;pz*=plate;
  const geology=heroGeology(shape,x,y,z);
  // Inward, metre-scale joint recesses and peeling steps. No envelope growth,
  // new silhouette lobes, extra tessellation or distance-dependent deformation.
  const recess=.026*geology.fault+.018*geology.peel+.012*geology.impact+heroSpall(shape,x,y,z);
  const inward=1-recess;
  px*=inward;py*=inward;pz*=inward;
  // Shared fixed envelope, rather than independently rescaling the LOD meshes.
  return out.set(px/1.32,py/1.32,pz/1.32);
}

export function orbitHeroGeometry(shape: number, lod: number) {
  const geometry=new THREE.SphereGeometry(1,[64,40,24][lod],[48,30,18][lod]);
  const p=geometry.getAttribute('position'),colors=new Float32Array(p.count*3),features=new Float32Array(p.count*4),
    coordinates=new Float32Array(p.count*3),point=new THREE.Vector3();
  for(let i=0;i<p.count;i++) {
    point.fromBufferAttribute(p,i); const {x,y,z}=point;
    heroSurface(shape,x,y,z,point); p.setXYZ(i,point.x,point.y,point.z);
    const geology=heroGeology(shape,x,y,z);
    coordinates.set([x,y,z],i*3);
    features.set([geology.fresh,geology.fault,geology.peel,geology.weather],i*4);
    const albedo=.76+.07*geology.fresh-.045*geology.weather-.035*geology.fault;
    colors.set([albedo,albedo*.985,albedo*.96],i*3);
  }
  geometry.setAttribute('rockFamily',new THREE.BufferAttribute(new Float32Array(p.count).fill(shape),1));
  geometry.setAttribute('heroFeatures',new THREE.BufferAttribute(features,4));
  geometry.setAttribute('heroCoord',new THREE.BufferAttribute(coordinates,3));
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.computeVertexNormals();geometry.computeBoundingSphere();
  const n=geometry.getAttribute('normal');
  for(let i=0;i<n.count;i++)if(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))<.01) {
    point.fromBufferAttribute(p,i).normalize();n.setXYZ(i,point.x,point.y,point.z);
  }
  // Preserve hard shear lips while leaving weathered curved areas smooth.
  // Remove collapsed cut faces before creasing and re-index the shared vertices.
  const index=geometry.getIndex()!,valid:number[]=[],a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  for(let i=0;i<index.count;i+=3) {
    const ia=index.getX(i),ib=index.getX(i+1),ic=index.getX(i+2);
    a.fromBufferAttribute(p,ia);b.fromBufferAttribute(p,ib);c.fromBufferAttribute(p,ic);
    if(b.sub(a).cross(c.sub(a)).lengthSq()>1e-15)valid.push(ia,ib,ic);
  }
  geometry.setIndex(valid);
  const creased=toCreasedNormals(geometry,.95);geometry.dispose();
  const indexed=mergeVertices(creased,1e-6);creased.dispose();indexed.computeBoundingSphere();
  return indexed;
}
