const fade=(x:number)=>x*x*x*(x*(x*6-15)+10);
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
function gradient(x:number,y:number,z:number,seed:number,dx:number,dy:number,dz:number) {
  let h=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(z,1274126177)^seed;
  h=Math.imul(h^(h>>>13),1274126177);h=(h^(h>>>16))&15;
  const u=h<8?dx:dy,v=h<4?dy:h===12||h===14?dx:dz;
  return ((h&1)?-u:u)+((h&2)?-v:v);
}
/** Periodic gradient noise, baked once per world; no DOM or WebGL is needed. */
export function stoneNoise(x:number,y:number,z:number,period:number,seed:number) {
  const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z),fx=x-ix,fy=y-iy,fz=z-iz;
  const wrap=(v:number)=>(v%period+period)%period;
  const at=(a:number,b:number,c:number)=>gradient(wrap(ix+a),wrap(iy+b),wrap(iz+c),seed,fx-a,fy-b,fz-c);
  const u=fade(fx),v=fade(fy),w=fade(fz);
  return .5+.5*mix(mix(mix(at(0,0,0),at(1,0,0),u),mix(at(0,1,0),at(1,1,0),u),v),
    mix(mix(at(0,0,1),at(1,0,1),u),mix(at(0,1,1),at(1,1,1),u),v),w);
}
export function stoneVolume(size=32) {
  const data=new Uint8Array(size**3*4),periods=[4,7,11,5];
  for(let z=0;z<size;z++)for(let y=0;y<size;y++)for(let x=0;x<size;x++)for(let c=0;c<4;c++) {
    const p=periods[c],n=stoneNoise((x+.5)/size*p,(y+.5)/size*p,(z+.5)/size*p,p,1207+c*991);
    data[((z*size+y)*size+x)*4+c]=Math.round(Math.max(0,Math.min(1,n))*255);
  }
  return data;
}

function cellRandom(x:number,y:number,z:number,channel:number) {
  let h=Math.imul((x%4+4)%4,374761393)^Math.imul((y%4+4)%4,668265263)^Math.imul((z%4+4)%4,1274126177)^Math.imul(channel+17,1597334677);
  h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;
}

/** A prefiltered, periodic 3D rock field: joint distance, grains, weathering and pits.
 * The joints are irregular cellular boundaries, not sine contours or UV stripes. */
export function asteroidSurfaceVolume(size=64) {
  const data=new Uint8Array(size**3*4);
  for(let z=0;z<size;z++)for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const px=(x+.5)/size*4,py=(y+.5)/size*4,pz=(z+.5)/size*4;
    const ix=Math.floor(px),iy=Math.floor(py),iz=Math.floor(pz);
    let first=Infinity,second=Infinity;
    for(let dz=-1;dz<=1;dz++)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) {
      const cx=ix+dx,cy=iy+dy,cz=iz+dz;
      const distance=Math.hypot(px-cx-.18-.64*cellRandom(cx,cy,cz,0),
        py-cy-.18-.64*cellRandom(cx,cy,cz,1),pz-cz-.18-.64*cellRandom(cx,cy,cz,2));
      if(distance<first){second=first;first=distance;}else if(distance<second)second=distance;
    }
    const i=((z*size+y)*size+x)*4;
    data[i]=Math.round(Math.min(1,(second-first)*2)*255);
    data[i+1]=Math.round(stoneNoise(px*2,py*2,pz*2,8,3813)*255);
    data[i+2]=Math.round(stoneNoise(px,py,pz,4,8917)*255);
    data[i+3]=Math.round(Math.min(1,first)*255);
  }
  return data;
}
