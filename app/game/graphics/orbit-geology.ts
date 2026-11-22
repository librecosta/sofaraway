import * as THREE from 'three';
import { heroSolids,heroDomains } from './orbit-hero-solid';
export { heroSolids,heroDomains } from './orbit-hero-solid';

export const heroFamilies = ['Fractured Monolith', 'Twin-Lobe Mass', 'Stratified Cliff', 'Impact Scar', 'Elongated Shard'] as const;
/** Material semantics are selected by the same solid/cutter that owns the surface.
 * Existing E1 grain remains micro detail; no second hero material is introduced. */
export function heroGeology(shape:number,x:number,y:number,z:number) {
  const region=heroSolids[shape].region(x,y,z);
  const fresh=region==='weathered'?.08:region==='floor'?.24:region==='rim'?.48:.88;
  return {fresh,fault:region==='fault'?.22:0,peel:region==='exfoliation'?.65:0,
    impact:region==='floor'?1:0,weather:region==='weathered'?.80:region==='floor'?.65:.20};
}

const cubeFaces=[
  {corners:[0,1,3,2],edges:[0,5,1,4]}, {corners:[4,5,7,6],edges:[2,7,3,6]},
  {corners:[0,1,5,4],edges:[0,9,2,8]}, {corners:[2,3,7,6],edges:[1,11,3,10]},
  {corners:[0,2,6,4],edges:[4,10,6,8]}, {corners:[1,3,7,5],edges:[5,11,7,9]},
];
const cubeEdges=[[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];

/** Cell-constrained surface nets with a regularized plane fit. The fixed solid
 * supplies all tiers; the fit preserves shear planes without sphere remapping.
 * Face connectivity separates multiple surface sheets in ambiguous cells.
 * Adjacent cells use the same bilinear face decision, preserving closed topology. */
function buildHeroGeometry(shape:number,lod:number) {
  if(!heroSolids[shape]||!Number.isInteger(lod)||lod<0||lod>2)throw new RangeError('Invalid hero family or LOD');
  const solid=heroSolids[shape],domain=heroDomains[shape],cells=[34,26,20][lod],edge=cells+1;
  const values=new Float64Array(edge**3),steps=[0,1,2].map(i=>(domain[i+3]-domain[i])/cells);
  const id=(x:number,y:number,z:number)=>(z*edge+y)*edge+x;
  for(let z=0;z<edge;z++)for(let y=0;y<edge;y++)for(let x=0;x<edge;x++)
    values[id(x,y,z)]=solid.distance(domain[0]+x*steps[0],domain[1]+y*steps[1],domain[2]+z*steps[2])-.000173;
  const positions:number[]=[],colors:number[]=[],features:number[]=[],indices:number[]=[];
  const vertices=new Int32Array(cells**3*12).fill(-1),regions=new Set<string>();
  const cellId=(x:number,y:number,z:number)=>(z*cells+y)*cells+x;
  const arcKeys=new Map<number,number>(),edgeRange=3*edge**3;
  const gridEdge=(x:number,y:number,z:number,e:number)=>{
    const a=cubeEdges[e][0];return id(x+(a&1),y+((a>>1)&1),z+((a>>2)&1))*3+(e<4?0:e<8?1:2);
  };
  const append=(x:number,y:number,z:number)=>{
    const px=Math.fround(x),py=Math.fround(y),pz=Math.fround(z),vertex=positions.length/3;
    positions.push(px,py,pz);
    const geology=heroGeology(shape,px,py,pz);regions.add(solid.region(px,py,pz));
    features.push(geology.fresh,geology.fault,geology.peel,geology.weather);
    const albedo=.77+.055*geology.fresh-.025*geology.weather;colors.push(albedo,albedo*.985,albedo*.96);
    return vertex;
  };
  for(let z=0;z<cells;z++)for(let y=0;y<cells;y++)for(let x=0;x<cells;x++) {
    const v=[values[id(x,y,z)],values[id(x+1,y,z)],values[id(x,y+1,z)],values[id(x+1,y+1,z)],
      values[id(x,y,z+1)],values[id(x+1,y,z+1)],values[id(x,y+1,z+1)],values[id(x+1,y+1,z+1)]];
    if(v.every(d=>d<0)||v.every(d=>d>=0))continue;
    const parent=Array.from({length:12},(_,i)=>i);
    const root=(i:number):number=>parent[i]===i?i:(parent[i]=root(parent[i]));
    const join=(a:number,b:number)=>{parent[root(a)]=root(b);};
    const crossing=cubeEdges.map(([a,b])=>(v[a]<0)!==(v[b]<0));
    for(const [faceIndex,face]of cubeFaces.entries()) {
      const connect=(a:number,b:number)=>{
        join(a,b);const ea=gridEdge(x,y,z,a),eb=gridEdge(x,y,z,b),key=Math.min(ea,eb)*edgeRange+Math.max(ea,eb);
        arcKeys.set((cellId(x,y,z)*12+a)*6+faceIndex,key);arcKeys.set((cellId(x,y,z)*12+b)*6+faceIndex,key);
      };
      const active=face.edges.filter(e=>crossing[e]);
      if(active.length===2)connect(active[0],active[1]);
      else if(active.length===4) {
        const [a,b,c,d]=face.corners.map(i=>v[i]);
        // The saddle value, rather than an arbitrary cell diagonal, resolves the face.
        const denominator=a+c-b-d;
        const middle=Math.abs(denominator)>1e-12?(a*c-b*d)/denominator:(a+b+c+d)/4;
        const e=face.edges;
        if((middle<0)===(a<0)){connect(e[0],e[1]);connect(e[2],e[3]);}
        else{connect(e[0],e[3]);connect(e[1],e[2]);}
      }
    }
    const sheets=new Map<number,number[]>();
    for(let i=0;i<12;i++)if(crossing[i]) {
      const group=root(i);if(!sheets.has(group))sheets.set(group,[]);sheets.get(group)!.push(i);
    }
    for(const sheet of sheets.values()) {
    let mx=0,my=0,mz=0,count=0,xx=0,xy=0,xz=0,yy=0,yz=0,zz=0,bx=0,by=0,bz=0;
    for(const edgeIndex of sheet) {
      const [a,b]=cubeEdges[edgeIndex];
      const t=v[a]/(v[a]-v[b]);
      const u=(a&1)+((b&1)-(a&1))*t,j=((a>>1)&1)+(((b>>1)&1)-((a>>1)&1))*t,
        w=((a>>2)&1)+(((b>>2)&1)-((a>>2)&1))*t;
      const nx=((v[1]-v[0])*(1-j)*(1-w)+(v[3]-v[2])*j*(1-w)+(v[5]-v[4])*(1-j)*w+(v[7]-v[6])*j*w)/steps[0];
      const ny=((v[2]-v[0])*(1-u)*(1-w)+(v[3]-v[1])*u*(1-w)+(v[6]-v[4])*(1-u)*w+(v[7]-v[5])*u*w)/steps[1];
      const nz=((v[4]-v[0])*(1-u)*(1-j)+(v[5]-v[1])*u*(1-j)+(v[6]-v[2])*(1-u)*j+(v[7]-v[3])*u*j)/steps[2];
      const length=Math.max(1e-12,Math.hypot(nx,ny,nz)),a0=nx/length,a1=ny/length,a2=nz/length;
      const px=u*steps[0],py=j*steps[1],pz=w*steps[2],d=a0*px+a1*py+a2*pz;
      mx+=px;my+=py;mz+=pz;count++;
      xx+=a0*a0;xy+=a0*a1;xz+=a0*a2;yy+=a1*a1;yz+=a1*a2;zz+=a2*a2;
      bx+=a0*d;by+=a1*d;bz+=a2*d;
    }
    mx/=count;my/=count;mz/=count;
    // The mass-point term keeps singular planar fits bounded and deterministic.
    const regularization=.035*count;xx+=regularization;yy+=regularization;zz+=regularization;
    bx+=regularization*mx;by+=regularization*my;bz+=regularization*mz;
    const c00=yy*zz-yz*yz,c01=xz*yz-xy*zz,c02=xy*yz-xz*yy,c11=xx*zz-xz*xz,c12=xy*xz-xx*yz,c22=xx*yy-xy*xy;
    const determinant=xx*c00+xy*c01+xz*c02;
    const fitted=[(c00*bx+c01*by+c02*bz)/determinant,(c01*bx+c11*by+c12*bz)/determinant,(c02*bx+c12*by+c22*bz)/determinant];
    const point=fitted.map((p,i)=>Math.max(steps[i]*.01,Math.min(steps[i]*.99,p)));
    const px=Math.fround(domain[0]+x*steps[0]+point[0]),py=Math.fround(domain[1]+y*steps[1]+point[1]),pz=Math.fround(domain[2]+z*steps[2]+point[2]);
    const vertex=append(px,py,pz);for(const edgeIndex of sheet)vertices[cellId(x,y,z)*12+edgeIndex]=vertex;
    }
  }
  const quads:{face:number[];arcs:number[];forward:boolean}[]=[],shared=new Map<string,Set<number>>();
  const edgeKey=(a:number,b:number)=>a<b?`${a}:${b}`:`${b}:${a}`;
  const quad=(a:number,b:number,c:number,d:number,forward:boolean,arcs:number[])=>{
    if(Math.min(a,b,c,d)<0||arcs.some(a=>a===undefined))throw new Error('Unclosed hero cell boundary');
    const face=[a,b,c,d];quads.push({face,arcs,forward});
    for(let i=0;i<4;i++){
      const key=edgeKey(face[i],face[(i+1)%4]);if(!shared.has(key))shared.set(key,new Set());shared.get(key)!.add(arcs[i]);
    }
  };
  const arc=(x:number,y:number,z:number,e:number,f:number)=>arcKeys.get((cellId(x,y,z)*12+e)*6+f)!;
  const at=(x:number,y:number,z:number,e:number)=>vertices[cellId(x,y,z)*12+e];
  const crosses=(a:number,b:number)=>(values[a]<0)!==(values[b]<0);
  for(let z=1;z<cells;z++)for(let y=1;y<cells;y++)for(let x=0;x<cells;x++)
    if(crosses(id(x,y,z),id(x+1,y,z)))quad(at(x,y-1,z-1,3),at(x,y,z-1,2),at(x,y,z,0),at(x,y-1,z,1),values[id(x,y,z)]<0,[arc(x,y-1,z-1,3,3),arc(x,y,z-1,2,1),arc(x,y,z,0,2),arc(x,y-1,z,1,0)]);
  for(let z=1;z<cells;z++)for(let y=0;y<cells;y++)for(let x=1;x<cells;x++)
    if(crosses(id(x,y,z),id(x,y+1,z)))quad(at(x-1,y,z-1,7),at(x-1,y,z,5),at(x,y,z,4),at(x,y,z-1,6),values[id(x,y,z)]<0,[arc(x-1,y,z-1,7,1),arc(x-1,y,z,5,5),arc(x,y,z,4,0),arc(x,y,z-1,6,4)]);
  for(let z=0;z<cells;z++)for(let y=1;y<cells;y++)for(let x=1;x<cells;x++)
    if(crosses(id(x,y,z),id(x,y,z+1)))quad(at(x-1,y-1,z,11),at(x,y-1,z,10),at(x,y,z,8),at(x-1,y,z,9),values[id(x,y,z)]<0,[arc(x-1,y-1,z,11,5),arc(x,y-1,z,10,3),arc(x,y,z,8,4),arc(x-1,y,z,9,2)]);
  const midpoint=new Map<number,number>();
  const intersection=(grid:number)=>{
    const node=Math.floor(grid/3),axis=grid%3,x=node%edge,y=Math.floor(node/edge)%edge,z=Math.floor(node/(edge*edge));
    const next=node+[1,edge,edge*edge][axis],t=values[node]/(values[node]-values[next]);
    return [domain[0]+(x+(axis===0?t:0))*steps[0],domain[1]+(y+(axis===1?t:0))*steps[1],domain[2]+(z+(axis===2?t:0))*steps[2]];
  };
  const emit=(a:number,b:number,c:number,forward:boolean)=>indices.push(a,forward?b:c,forward?c:b);
  for(const {face,arcs,forward}of quads) {
    const boundary:number[]=[];
    for(let i=0;i<4;i++) {
      const a=face[i],b=face[(i+1)%4],key=arcs[i];boundary.push(a);
      // A dual edge can connect two different face arcs at a narrow cut. Give
      // those arcs their actual distinct face intersections, never a pinched edge.
      if(shared.get(edgeKey(a,b))!.size>1) {
        if(!midpoint.has(key)) {
          const u=intersection(Math.floor(key/edgeRange)),v=intersection(key%edgeRange);
          midpoint.set(key,append((u[0]+v[0])/2,(u[1]+v[1])/2,(u[2]+v[2])/2));
        }
        boundary.push(midpoint.get(key)!);
      }
    }
    if(boundary.length===4) {
      const [a,b,c,d]=face;
      const distance=(i:number,j:number)=>(positions[i*3]-positions[j*3])**2+(positions[i*3+1]-positions[j*3+1])**2+(positions[i*3+2]-positions[j*3+2])**2;
      if(distance(a,c)<distance(b,d)){emit(a,b,c,forward);emit(a,c,d,forward);}
      else{emit(a,b,d,forward);emit(b,c,d,forward);}
    } else {
      const center=[0,1,2].map(axis=>boundary.reduce((sum,i)=>sum+positions[i*3+axis],0)/boundary.length);
      const vertex=append(center[0],center[1],center[2]);
      for(let i=0;i<boundary.length;i++)emit(vertex,boundary[i],boundary[(i+1)%boundary.length],forward);
    }
  }
  // Boolean intersections can leave isolated sub-cell chips at near-tangent
  // interfaces. They have no resolved attachment and must not become floating
  // surface patches. Reject substantial detached masses rather than hiding them.
  const count=positions.length/3,parent=Array.from({length:count},(_,i)=>i);
  const root=(i:number):number=>parent[i]===i?i:(parent[i]=root(parent[i]));
  for(let i=0;i<indices.length;i+=3){parent[root(indices[i])]=root(indices[i+1]);parent[root(indices[i+1])]=root(indices[i+2]);}
  const groups=new Map<number,number[]>();
  for(let i=0;i<count;i++){const key=root(i);if(!groups.has(key))groups.set(key,[]);groups.get(key)!.push(i);}
  const connected=[...groups.values()].sort((a,b)=>b.length-a.length),used=connected[0].sort((a,b)=>a-b);
  for(const chip of connected.slice(1)) {
    const span=[0,1,2].map(axis=>Math.max(...chip.map(i=>positions[i*3+axis]))-Math.min(...chip.map(i=>positions[i*3+axis])));
    if(chip.length>Math.max(24,used.length*.01)||Math.hypot(...span)>2*Math.hypot(...steps))throw new Error('Detached hero structural mass');
  }
  const remap=new Int32Array(count).fill(-1);used.forEach((old,i)=>{remap[old]=i;});
  const kept=indices.filter((_,i)=>remap[indices[i-i%3]]>=0).map(i=>remap[i]);
  const compact=(data:number[],size:number)=>new THREE.Float32BufferAttribute(used.flatMap(i=>data.slice(i*size,(i+1)*size)),size);
  const geometry=new THREE.BufferGeometry();geometry.name=`${heroFamilies[shape]} solid LOD ${lod}`;
  geometry.setAttribute('position',compact(positions,3));
  geometry.setAttribute('color',compact(colors,3));
  geometry.setAttribute('heroCoord',compact(positions,3));
  geometry.setAttribute('heroFeatures',compact(features,4));
  geometry.setAttribute('rockFamily',new THREE.Float32BufferAttribute(new Float32Array(used.length).fill(shape),1));
  geometry.setIndex(kept);geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  geometry.userData.geology={cells,regions:[...regions].sort()};return geometry;
}

// Only immutable CPU arrays survive a world. Every caller owns fresh GPU-facing
// geometry/attributes, so retries and context recovery do not repeat extraction.
const heroMeshCache=new Map<string,{
  name:string;attributes:[string,Float32Array,number][];index:Uint16Array|Uint32Array;
  geology:{cells:number;regions:string[]};
}>();
export function orbitHeroGeometry(shape:number,lod:number):THREE.BufferGeometry {
  const key=`${shape}:${lod}`,cached=heroMeshCache.get(key);
  if(!cached) {
    const geometry=buildHeroGeometry(shape,lod);
    heroMeshCache.set(key,{name:geometry.name,
      attributes:Object.entries(geometry.attributes).map(([name,a])=>[name,(a.array as Float32Array).slice(),a.itemSize]),
      index:(geometry.index!.array as Uint16Array|Uint32Array).slice(),geology:structuredClone(geometry.userData.geology)});
    return geometry;
  }
  const geometry=new THREE.BufferGeometry();geometry.name=cached.name;
  for(const [name,array,size]of cached.attributes)geometry.setAttribute(name,new THREE.BufferAttribute(array.slice(),size));
  geometry.setIndex(new THREE.BufferAttribute(cached.index.slice(),1));
  geometry.userData.geology=structuredClone(cached.geology);
  geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
