import { expect, test } from 'vitest';
import { Mesh, Vector3 } from 'three';
import { routeSides, selectSide } from '../../app/game/core/branches';
import { RANGE_X, playerViewOffset } from '../../app/game/core/collision';
import { orbitRouteSwatches } from '../../app/game/core/orbit-routes';
import { Simulation } from '../../app/game/core/simulation';
import { volumeById } from '../../app/game/core/volumes';
import { OrbitEntryBeacons } from '../../app/game/graphics/orbit-entry-beacons.client';

test('small entry beacons occupy the real reachable Split input bands and never extend along branches', () => {
  for(const mode of ['standard','sightseeing'] as const)for(const difficulty of ['normal','impossible'] as const)for(const seed of [0,1]) {
    const sim=new Simulation(volumeById('orbit'));sim.start(difficulty,seed,undefined,mode);
    const path=sim.junctionPath!,beacons=new OrbitEntryBeacons(path,sim.branch!.layout),frame=path.base.sample(path.split+1.5);
    const meshes=beacons.group.children.filter((_,i)=>i%2===0) as Mesh[];
    expect(meshes).toHaveLength(3);
    expect(new Set(meshes.map(m=>m.geometry)).size).toBe(1);
    for(const [i,choice]of beacons.choices.entries()) {
      expect(Math.abs(choice.x)).toBeLessThanOrEqual(RANGE_X);
      expect(selectSide(choice.x,path.spec.sideThreshold)).toBe(routeSides[i]);
      expect(choice.optical).toEqual(playerViewOffset(choice.x,-.95,path.steeringWidth(path.split)));
      const offset=meshes[i].position.clone().sub(frame.p);
      expect(offset.dot(frame.r)).toBeCloseTo(choice.optical[0],8);
      expect(offset.dot(frame.u)).toBeCloseTo(choice.optical[1],8);
      expect(offset.dot(frame.f)).toBeCloseTo(0,8);
    }
    const resources=new Set<import('three').BufferGeometry|import('three').Material>();
    beacons.group.traverse(object=>{if(object instanceof Mesh){resources.add(object.geometry);resources.add(object.material);}});
    let released=0;for(const r of resources)r.addEventListener('dispose',()=>released++);
    const stations=[path.guideStart-40,path.guideStart-20,path.guideStart,path.split+3,path.split+8,path.open,path.merge,path.end];
    for(const [i,station]of stations.entries()) {
      beacons.update(station,'left',station>=path.split,540);
      expect(beacons.metrics().phase).toBe(['hidden','approach','choice','fading','hidden','hidden','hidden','hidden'][i]);
      expect(beacons.group.children).toHaveLength(6);
    }
    expect(beacons.metrics().colors).toEqual(routeSides.map(side=>orbitRouteSwatches[sim.branch!.layout[side]].toLowerCase()));
    const point=new Vector3();for(const m of meshes)expect(point.copy(m.position).distanceTo(frame.p)).toBeLessThan(4);
    beacons.dispose();expect(released).toBe(10);
  }
});
