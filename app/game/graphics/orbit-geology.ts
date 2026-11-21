import * as THREE from 'three';

export const heroFamilies = ['Fractured Monolith', 'Twin-Lobe Mass', 'Stratified Cliff', 'Impact Scar', 'Elongated Shard'] as const;

/** Broad planes, displaced strata and local excavation, evaluated identically at every LOD. */
export function heroSurface(shape: number, x: number, y: number, z: number, out: THREE.Vector3) {
  const plane = Math.min(1.04, .82 / Math.max(.01, x*.72+y*.23+z*.65),
    .88 / Math.max(.01, -x*.65+y*.62-z*.44));
  const scar = Math.exp(-1*((x-.32)**2*12+(y-.22)**2*8)) * Math.max(0,z);
  let px=x*plane, py=y*plane, pz=z*plane;
  if(shape===0) {
    // Two offset cleavage shelves and a missing shoulder make an asymmetric spire.
    px=px*(.66+.18*y)+.15*y*y;
    const ledge=y>.28?.09:y<-.27?-.10:0;
    pz=Math.min(pz,.44+.24*y+ledge)-.17*Math.exp(-1*((y-.25)/.22)**2)*Math.max(0,x);
    py*=1.13; px+=y>.22?.08: y<-.24?-.10:0;
  } else if(shape===1) {
    const lobe = .70+.30*Math.pow(Math.abs(y),.48);
    px*=lobe*(y>0?1.05:.73); pz*=lobe;
    px+=.23*y; pz+=.16*y*y; py*=.94;
  } else if(shape===2) {
    const shelf=Math.floor((y+1)*5)/5;
    const seam=Math.exp(-1*((y*5-Math.round(y*5))/.13)**2);
    px=px*.85+.15*shelf; pz=Math.min(pz,.50+.21*shelf)-.065*seam;
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
  // Shared fixed envelope, rather than independently rescaling the LOD meshes.
  return out.set(px/1.32,py/1.32,pz/1.32);
}

export function orbitHeroGeometry(shape: number, lod: number) {
  const geometry=new THREE.SphereGeometry(1,[64,40,24][lod],[48,30,18][lod]);
  const p=geometry.getAttribute('position'),colors=new Float32Array(p.count*3),point=new THREE.Vector3();
  for(let i=0;i<p.count;i++) {
    point.fromBufferAttribute(p,i); const {x,y,z}=point;
    heroSurface(shape,x,y,z,point); p.setXYZ(i,point.x,point.y,point.z);
    const strata=shape===2 ? .07*Math.floor((y+1)*5) : 0;
    const cut=Math.max(0,z-.45)*.23;
    const albedo=.67+strata+cut+.055*y;
    colors.set([albedo*.94,albedo*.97,albedo],i*3);
  }
  geometry.setAttribute('rockFamily',new THREE.BufferAttribute(new Float32Array(p.count).fill(shape),1));
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.computeVertexNormals();geometry.computeBoundingSphere();
  const n=geometry.getAttribute('normal');
  for(let i=0;i<n.count;i++)if(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))<.01) {
    point.fromBufferAttribute(p,i).normalize();n.setXYZ(i,point.x,point.y,point.z);
  }
  return geometry;
}
