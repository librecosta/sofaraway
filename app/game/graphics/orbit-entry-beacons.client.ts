import * as THREE from 'three';
import { BRANCH_SIDE_THRESHOLD, ROUTE_LABELS, routeSides, selectSide } from '../core/branches';
import type { BranchLayout, RouteSide } from '../core/branches';
import { RANGE_X, playerViewOffset } from '../core/collision';
import { ease } from '../core/lighting-score';
import { orbitRouteSwatches } from '../core/orbit-routes';
import { BranchPath } from './branch-path';
import { routeGlyphs } from './route-glyphs';

/** A comfortable point in each real input band, inside even the base section. */
export function entryChoices(path:BranchPath) {
  const threshold=path.spec.sideThreshold??BRANCH_SIDE_THRESHOLD;
  const lateral=threshold+(RANGE_X-threshold)*.65;
  return [-lateral,0,lateral].map(x=>({x,side:selectSide(x,threshold),
    optical:playerViewOffset(x,-.95,path.steeringWidth(path.split))}));
}

function nameGeometry(word:string) {
  const shapes:THREE.Shape[]=[];let advance=0;
  for(const letter of word) {
    const [width,outline]=routeGlyphs[letter],tokens=outline.split(' '),path=new THREE.ShapePath();let i=0;
    const x=()=> (+tokens[i++]+advance)*.00023,y=()=>+tokens[i++]*.00023;
    while(i<tokens.length)switch(tokens[i++]) {
      case 'm':path.moveTo(x(),y());break;case 'l':path.lineTo(x(),y());break;
      case 'q':path.quadraticCurveTo(x(),y(),x(),y());break;
      case 'c':path.bezierCurveTo(x(),y(),x(),y(),x(),y());break;
    }
    shapes.push(...path.toShapes());advance+=width+26;
  }
  const geometry=new THREE.ShapeGeometry(shapes,3);geometry.computeBoundingBox();
  const box=geometry.boundingBox!;geometry.translate(-(box.min.x+box.max.x)/2,0,0);return geometry;
}

export class OrbitEntryBeacons {
  readonly group=new THREE.Group();
  readonly choices;
  private readonly plane=new THREE.PlaneGeometry(1.30,.64);
  private readonly lamps:THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>[]=[];
  private readonly labels:THREE.Mesh<THREE.ShapeGeometry,THREE.MeshBasicMaterial>[]=[];
  private gain=0;
  private phase='hidden';
  private selected=-1;
  readonly colors;
  constructor(readonly path:BranchPath,readonly layout:BranchLayout) {
    this.group.name='Branch Entry Beacons';this.choices=entryChoices(path);
    this.colors=routeSides.map(side=>orbitRouteSwatches[layout[side]].toLowerCase());
    const frame=path.base.sample(path.split+1.5),basis=new THREE.Matrix4().makeBasis(frame.r,frame.u,frame.f.clone().negate());
    for(const [i,choice]of this.choices.entries()) {
      const material=new THREE.ShaderMaterial({transparent:true,depthTest:true,depthWrite:false,
        uniforms:{tint:{value:new THREE.Color(this.colors[i])},gain:{value:0},height:{value:540}},
        vertexShader:`varying vec2 vUv;uniform float height;void main(){vUv=uv;
          vec4 center=modelViewMatrix*vec4(0,0,0,1);vec4 p=modelViewMatrix*vec4(position,1);
          float size=projectionMatrix[1][1]*height/max(1.,-center.z);
          p.xy=center.xy+(p.xy-center.xy)*max(1.,10.0/max(1.,size));
          gl_Position=projectionMatrix*p;}`,
        fragmentShader:`varying vec2 vUv;uniform vec3 tint;uniform float gain;void main(){
          vec2 q=(vUv-.5)*2.;float a=exp(-dot(q,q)*4.8)*(1.-smoothstep(.65,1.,length(q)));
          gl_FragColor=vec4(tint*1.3,a*gain*.82);
          #include <colorspace_fragment>
        }`});
      const lamp=new THREE.Mesh(this.plane,material);lamp.name=ROUTE_LABELS[layout[routeSides[i]]];
      lamp.position.copy(frame.p).addScaledVector(frame.r,choice.optical[0]).addScaledVector(frame.u,choice.optical[1]);
      lamp.quaternion.setFromRotationMatrix(basis);lamp.renderOrder=4;this.group.add(lamp);this.lamps.push(lamp);
      const label=new THREE.Mesh(nameGeometry(lamp.name),new THREE.MeshBasicMaterial({color:this.colors[i],transparent:true,depthWrite:false}));
      label.position.copy(lamp.position).addScaledVector(frame.u,-.40);label.quaternion.copy(lamp.quaternion);label.renderOrder=4;
      this.labels.push(label);this.group.add(label);
    }
    this.group.visible=false;
  }
  update(station:number,side:RouteSide|null,committed:boolean,height:number) {
    this.gain=ease((station-(this.path.guideStart-35))/30)*(1-ease((station-this.path.split)/7));
    this.selected=side?routeSides.indexOf(side):-1;
    this.group.visible=this.gain>.001;
    this.phase=!this.group.visible?'hidden':committed?'fading':station<this.path.guideStart?'approach':'choice';
    for(const [i,lamp]of this.lamps.entries()) {
      lamp.material.uniforms.gain.value=this.gain*(i===this.selected?1:.78);lamp.material.uniforms.height.value=height;
      this.labels[i].material.opacity=this.gain*.85;
    }
  }
  metrics(){return {visible:this.group.visible,phase:this.phase,gain:this.gain,selected:this.selected,
    layout:this.layout,colors:this.colors,choices:this.choices,splitPlane:this.path.split+1.5,vertices:this.plane.attributes.position.count,
    labels:routeSides.map(s=>ROUTE_LABELS[this.layout[s]])};}
  dispose(){this.group.removeFromParent();this.plane.dispose();for(const l of this.lamps)l.material.dispose();
    for(const l of this.labels){l.geometry.dispose();l.material.dispose();}this.group.clear();}
}
