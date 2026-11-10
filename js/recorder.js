import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 *  Recorder — a flight data recorder for the camera.
 *
 *  Every frame the final camera state is pushed into a ring buffer and
 *  two derived traces are drawn live: the roll itself, and the frame to
 *  frame change in roll. A healthy camera produces a smooth curve and a
 *  small, even delta trace. A shiver shows up immediately as spikes.
 *
 *  R          toggle the overlay
 *  Shift+R    download the last N seconds as JSON
 * ------------------------------------------------------------------ */

const CAP = 3600;          // ~60 s at 60 fps

export class Recorder {
  constructor() {
    this.frames = [];
    this.prev = null;
    this.visible = false;
    this.build();
  }

  /* ---------------- overlay ---------------- */
  build() {
    const c = document.createElement('canvas');
    c.width = 420; c.height = 150;
    c.id = 'rec';
    Object.assign(c.style, {
      position: 'fixed', right: '14px', bottom: '14px', zIndex: 9500,
      width: '420px', height: '150px', display: 'none',
      background: 'rgba(4,8,10,.82)', border: '1px solid rgba(220,238,248,.22)',
      pointerEvents: 'none',
    });
    document.body.appendChild(c);
    this.canvas = c;
    this.ctx = c.getContext('2d');
  }

  toggle() {
    this.visible = !this.visible;
    this.canvas.style.display = this.visible ? 'block' : 'none';
  }

  /* ---------------- sample ---------------- */
  sample(t, camera, G, CAM) {
    const p = camera.position;
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');

    let dp = 0, dr = 0, dyaw = 0;
    if (this.prev) {
      dp = Math.hypot(p.x - this.prev.px, p.y - this.prev.py, p.z - this.prev.pz);
      dr = Math.abs(CAM.roll - this.prev.roll);
      dyaw = Math.abs(e.y - this.prev.yaw);
    }

    const f = {
      t: +t.toFixed(3),
      d: +G.distance.toFixed(3),
      s: +G.speed.toFixed(2),
      cx: +CAM.x.toFixed(4),
      cy: +CAM.y.toFixed(4),
      roll: +CAM.roll.toFixed(5),
      px: +p.x.toFixed(4),
      py: +p.y.toFixed(4),
      pz: +p.z.toFixed(4),
      yaw: +e.y.toFixed(5),
      pitch: +e.x.toFixed(5),
      dp: +dp.toFixed(5),
      dr: +dr.toFixed(6),
      dyaw: +dyaw.toFixed(6),
    };

    this.prev = { px: p.x, py: p.y, pz: p.z, roll: CAM.roll, yaw: e.y };
    this.frames.push(f);
    if (this.frames.length > CAP) this.frames.shift();
  }

  /* ---------------- stats ---------------- */
  stats(n = 240) {
    const tail = this.frames.slice(-n);
    if (!tail.length) return null;
    const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const stdev = (arr) => {
      const m = mean(arr);
      return Math.sqrt(mean(arr.map((v) => (v - m) * (v - m))));
    };
    const dr = tail.map((f) => f.dr);
    const dp = tail.map((f) => f.dp);
    return {
      frames: tail.length,
      rollJitter: +stdev(dr).toFixed(6),
      rollMax: +Math.max(...dr).toFixed(6),
      posJitter: +stdev(dp).toFixed(6),
      posMax: +Math.max(...dp).toFixed(5),
    };
  }

  /* ---------------- draw ---------------- */
  draw() {
    if (!this.visible) return;
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);

    const data = this.frames.slice(-320);
    if (data.length < 2) return;

    const lane = (idx, count) => {
      const h = H / count;
      return { y: idx * h + 6, h: h - 12 };
    };

    const trace = (vals, box, colour, scale) => {
      const mx = Math.max(...vals.map(Math.abs), scale * 0.000001);
      ctx.strokeStyle = colour;
      ctx.beginPath();
      vals.forEach((v, i) => {
        const x = (i / (vals.length - 1)) * (W - 12) + 6;
        const y = box.y + box.h * 0.5 - (v / mx) * box.h * 0.5;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.fillStyle = colour;
      ctx.font = '10px monospace';
      ctx.fillText(`${Math.round(mx * 1e6) / 1e6}`, 6, box.y + 9);
    };

    const a = lane(0, 3);
    const b = lane(1, 3);

    trace(data.map((f) => f.roll), a, '#74ffdc', 0);
    trace(data.map((f) => f.dr), b, '#ff7a7a', 0);

    // delta of yaw rate is where orientation wobble hides
    const c = lane(2, 3);
    trace(data.map((f) => f.dyaw), c, '#ffd166', 0);

    const st = this.stats(240);
    ctx.fillStyle = 'rgba(220,238,248,.72)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(
      `roll σ ${st.rollJitter}  max ${st.rollMax}`,
      W - 8, H - 22
    );
    ctx.fillText(
      `pos σ ${st.posJitter}  max ${st.posMax}`,
      W - 8, H - 8
    );
    ctx.textAlign = 'left';
  }

  /* ---------------- export ---------------- */
  download() {
    const blob = new Blob([JSON.stringify({
      stats: this.stats(3600),
      frames: this.frames,
    })], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sofaraway-camlog.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}
