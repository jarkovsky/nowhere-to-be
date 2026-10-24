// Pictures of the garage's vehicles for the car picker, drawn from the models themselves
// so they always look like the cars. They are drawn with the game's own renderer, as a
// second WebGL context can cost an iPad the game's, into buffers off the screen, one a
// frame while the game is paused, and kept as images for the rest of the visit.
import * as THREE from 'three';
import { createCar } from '../vehicles/car.js';

/** A picture's size in CSS pixels: a little larger than the tiles show it, and their shape. */
const WIDTH = 112;
const HEIGHT = 70;
/** Each pixel of a picture is the average of this many by this many drawn, for smooth edges. */
const SUPERSAMPLE = 2;
/** The camera looks from in front and round to the car's left, a little from above. */
const AROUND = THREE.MathUtils.degToRad(52);
const ABOVE = THREE.MathUtils.degToRad(17);
/** How far away it stands, in car sizes: far enough that the back isn't much smaller than the front. */
const DISTANCE = 3.2;
/** The space left round the car, as a share of the picture. */
const MARGIN = 0.04;

const pictureName = (vehicle, color) => `${vehicle} ${color}`;

/** The game calls `drawNext` each frame while it's paused, and `onReady` is called as each picture is ready. */
export function createVehiclePictures(renderer, { onReady }) {
  const ready = new Map();
  const drawing = new Set();
  let waiting = new Map();
  let studio = null;
  let justAsked = false;

  return {
    /** The image URL of `vehicle`'s picture in `color`, or null until it's ready. */
    get: (vehicle, color) => ready.get(pictureName(vehicle, color)) ?? null,
    /** Asks for the pictures of `vehicles` in `colors`, to be drawn in that order before any others still waiting. */
    prepare(vehicles, colors) {
      const before = waiting;
      waiting = new Map();
      for (const color of colors) {
        for (const vehicle of vehicles) {
          const name = pictureName(vehicle, color);
          if (!ready.has(name) && !drawing.has(name)) waiting.set(name, { vehicle, color });
        }
      }
      for (const [name, picture] of before) if (!waiting.has(name)) waiting.set(name, picture);
      justAsked = true;
    },
    /** Draws the next picture waiting, and returns whether it did. */
    drawNext() {
      const [name, picture] = waiting.entries().next().value ?? [];
      if (!name) {
        // Nothing left to draw: let go of the car and the buffers until something is.
        studio?.dispose();
        studio = null;
        return false;
      }
      // The studio takes a while to build, so it gets a frame of its own, and not the one just
      // after the pictures are asked for: the menu that asks for them shows first.
      if (!studio) {
        if (!justAsked) studio = createStudio(renderer);
        justAsked = false;
        return false;
      }
      waiting.delete(name);
      drawing.add(name);
      studio.draw(picture.vehicle, picture.color).toBlob(async blob => {
        if (!blob) {
          drawing.delete(name);
          return;
        }
        const url = URL.createObjectURL(blob);
        // Unpacked before it's shown, so its tile isn't blank for a moment in between.
        const image = new Image();
        image.src = url;
        await image.decode().catch(() => {});
        ready.set(name, url);
        drawing.delete(name);
        onReady();
      });
      return true;
    },
  };
}

/** A copy of the player's car under a midday sky, and what it takes to photograph it. */
function createStudio(renderer) {
  // Everything made for this copy is its own to dispose. The materials it shares with the
  // rest of the game, such as the plain colours, were made before it and stay.
  const firstMaterial = new THREE.Material().id;
  const car = createCar();
  car.headlight.removeFromParent();
  const scene = new THREE.Scene();
  const sky = new THREE.HemisphereLight('#eef5ee', '#788567', 1.8);
  const sun = new THREE.DirectionalLight('#fff0cc', 2.4);
  scene.add(sky, sun, car.root, car.towed);
  const camera = new THREE.PerspectiveCamera();
  const geometries = new Set();
  const materials = new Set();

  const pixelRatio = Math.min(devicePixelRatio, 3);
  const width = Math.round(WIDTH * pixelRatio);
  const height = Math.round(HEIGHT * pixelRatio);
  // The car is lit in a buffer that holds light brighter than white, then tone mapped as
  // the game is on the screen (the renderer only tone maps what it draws on the screen).
  const floats = ['EXT_color_buffer_float', 'EXT_color_buffer_half_float'].some(name => renderer.extensions.has(name));
  const lit = new THREE.WebGLRenderTarget(width * SUPERSAMPLE, height * SUPERSAMPLE, {
    type: floats ? THREE.HalfFloatType : THREE.UnsignedByteType,
  });
  const finished = new THREE.WebGLRenderTarget(width, height);
  const finish = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: { picture: { value: lit.texture } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        #include <tonemapping_pars_fragment>
        uniform sampler2D picture;
        varying vec2 vUv;
        void main() {
          // Upside down, so the rows are read back top first. Sampled between the drawn
          // pixels, each takes the average of the square of them around it.
          vec4 color = texture2D(picture, vec2(vUv.x, 1.0 - vUv.y));
          // The edges are blended with the empty background: tone map the car's own colour.
          if (color.a > 0.0) color.rgb /= color.a;
          gl_FragColor = sRGBTransferOETF(vec4(ACESFilmicToneMapping(color.rgb), color.a));
        }`,
      depthTest: false,
      depthWrite: false,
    }),
  );
  finish.frustumCulled = false;
  const pixels = new Uint8Array(width * height * 4);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');

  const box = new THREE.Box3();
  const part = new THREE.Box3();
  const centre = new THREE.Vector3();
  const point = new THREE.Vector3();
  const toCamera = new THREE.Matrix4();

  /** Aims the camera at what is shown, cropped close round it. */
  function frame(meshes) {
    box.makeEmpty();
    for (const mesh of meshes) {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      box.union(part.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld));
    }
    box.getCenter(centre);
    const size = box.getSize(point).length();
    const distance = size * DISTANCE;
    camera.position
      .set(-Math.sin(AROUND) * Math.cos(ABOVE), Math.sin(ABOVE), -Math.cos(AROUND) * Math.cos(ABOVE))
      .multiplyScalar(distance)
      .add(centre);
    camera.lookAt(centre);
    camera.updateMatrixWorld();
    // The sun is high up behind the camera, so the roof is brightest and the side brighter than the front.
    sun.position.set(-1.2, 2.2, -0.7).add(centre);
    sun.target.position.copy(centre);
    sun.target.updateMatrixWorld();

    // How far each corner is to the side of and above the middle of the view, for each
    // metre in front of the camera, and the narrowest view that takes them all in.
    let [left, right, bottom, top] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const mesh of meshes) {
      toCamera.multiplyMatrices(camera.matrixWorldInverse, mesh.matrixWorld);
      const corners = mesh.geometry.attributes.position;
      for (let i = 0; i < corners.count; i++) {
        point.fromBufferAttribute(corners, i).applyMatrix4(toCamera);
        const x = point.x / -point.z;
        const y = point.y / -point.z;
        left = Math.min(left, x);
        right = Math.max(right, x);
        bottom = Math.min(bottom, y);
        top = Math.max(top, y);
      }
    }
    const aspect = width / height;
    const across = Math.max(right - left, (top - bottom) * aspect) / (1 - MARGIN * 2);
    const midX = (left + right) / 2;
    const midY = (bottom + top) / 2;
    const near = distance * 0.25;
    camera.projectionMatrix.makePerspective(
      (midX - across / 2) * near,
      (midX + across / 2) * near,
      (midY + across / aspect / 2) * near,
      (midY - across / aspect / 2) * near,
      near,
      distance * 2,
    );
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  return {
    /** Draws `vehicle` in `color` and returns the canvas holding the picture. */
    draw(vehicle, color) {
      car.customize(color, [], vehicle);
      // The rainbow paint changes colour as it goes: this is where it starts.
      if (color === 'rainbow') car.animate(0);
      car.setMud(0);
      // The lorry's trailer stands on its hitch, straight behind.
      if (car.trailer) {
        car.trailer.root.position.set(...car.trailer.spec.hitch);
        car.trailer.root.rotation.set(0, 0, 0);
      }
      scene.updateMatrixWorld(true);
      const meshes = [];
      scene.traverseVisible(object => object.isMesh && meshes.push(object));
      scene.traverse(object => {
        if (object.geometry) geometries.add(object.geometry);
        if (object.material?.id > firstMaterial) materials.add(object.material);
      });
      frame(meshes);

      // Leave the renderer as it was found.
      const target = renderer.getRenderTarget();
      const face = renderer.getActiveCubeFace();
      const level = renderer.getActiveMipmapLevel();
      const clearColor = renderer.getClearColor(new THREE.Color());
      const clearAlpha = renderer.getClearAlpha();
      const shadows = renderer.shadowMap.enabled;
      renderer.shadowMap.enabled = false;
      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(lit);
      renderer.render(scene, camera);
      renderer.setRenderTarget(finished);
      renderer.render(finish, camera);
      renderer.readRenderTargetPixels(finished, 0, 0, width, height, pixels);
      renderer.setRenderTarget(target, face, level); // which puts back its viewport too
      renderer.setClearColor(clearColor, clearAlpha);
      renderer.shadowMap.enabled = shadows;

      context.putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer), width, height), 0, 0);
      return canvas;
    },
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      lit.dispose();
      finished.dispose();
      finish.geometry.dispose();
      finish.material.dispose();
    },
  };
}
