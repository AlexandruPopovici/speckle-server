import * as THREE from 'three'

import Stats from 'three/examples/jsm/libs/stats.module.js'

import ObjectManager from './SceneObjectManager'
import ViewerObjectLoader from './ViewerObjectLoader'
import EventEmitter from './EventEmitter'
import InteractionHandler from './InteractionHandler'
import CameraHandler from './context/CameraHanlder'

import SectionBox from './SectionBox'
import Sandbox from './Sandbox'
import {
	Object3D
} from 'three'
import Color from 'colorjs.io'
import {
	Box3, DepthTexture, UnsignedShortType, WebGLRenderTarget, LinearFilter, RGBAFormat, UnsignedInt248Type, UnsignedIntType, HalfFloatType
} from 'three'
import {
	Vector3
} from 'three'
import {
	EXRLoader
} from 'three/examples/jsm/loaders/EXRLoader.js';
import {
	FixedPMREMGenerator
} from './FixedPMREMGenerator'
import {
	PMREMGenerator
} from 'three'
import {
	EffectComposer
} from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {
	RenderPass
} from 'three/examples/jsm/postprocessing/RenderPass.js';
import {
	SAOPass
} from './SAOPass';
import { JitteredPass } from './JitteredPass'
import { TAAReprojectionPass } from './TAAReprojectionPass'
import { Quaternion } from 'three'
import { GeometryPass } from './GeometryPass'

export default class Viewer extends EventEmitter {

	constructor({
		container,
		postprocessing = false,
		reflections = true,
		showStats = false
	}) {
		super()

		window.THREE = THREE

		this.clock = new THREE.Clock()

		this.container = container || document.getElementById('renderer')
		this.postprocessing = postprocessing
		this.scene = new THREE.Scene()

		this.renderer = new THREE.WebGLRenderer({
			antialias: true,
			alpha: true,
			preserveDrawingBuffer: true
		})
		this.renderer.setClearColor(0xcccccc, 0)
		this.renderer.setPixelRatio(window.devicePixelRatio)
		this.renderer.setSize(this.container.offsetWidth, this.container.offsetHeight)
		this.container.appendChild(this.renderer.domElement)

		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.VSMShadowMap;
		this.renderer.shadowMap.autoUpdate = false;
		this.renderer.shadowMap.needsUpdate = true;

		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.outputEncoding = THREE.sRGBEncoding; // We're doing gamma correction ourselves
		this.renderer.physicallyCorrectLights = true;

		this.cameraHandler = new CameraHandler(this)
		this.lastCameraPosition = new Vector3();
        this.lastCameraRotation = new Quaternion();
		this.lastCameraRadius = 0;
		this.framesStillCount = 0;
		this.taaFrames = 0;
		this.cameraStopped = false;
		this.allowTAA = true;

		this.reflections = reflections
		this.reflectionsNeedUpdate = true
		const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(512, {
			format: THREE.RGBFormat,
			generateMipmaps: true,
			minFilter: THREE.LinearMipmapLinearFilter
		})
		this.cubeCamera = new THREE.CubeCamera(0.1, 10_000, cubeRenderTarget)
		this.scene.add(this.cubeCamera)

		const geometryRenderTarget = new WebGLRenderTarget( this.container.offsetWidth, this.container.offsetHeight, {
			minFilter: LinearFilter,
			magFilter: LinearFilter,
			format: RGBAFormat,
			// type: HalfFloatType
		} );
		const depthTexture = new DepthTexture();
		depthTexture.type = UnsignedIntType;

		geometryRenderTarget.depthTexture = depthTexture;

		this.composer = new EffectComposer(this.renderer, geometryRenderTarget);

		// this.ssaoPass = new SSAOPass( this.scene, this.cameraHandler.activeCam.camera, this.container.offsetWidth, this.container.offsetHeight );
		// this.ssaoPass.kernelRadius = 16;
		// this.composer.addPass( this.ssaoPass );

		// const renderPass = new RenderPass(this.scene, this.cameraHandler.activeCam.camera);
		// this.composer.addPass(renderPass);
		// this.saoPass = new SAOPass(this.scene, this.cameraHandler.activeCam.camera, true, true);
		// this.composer.addPass(this.saoPass);
		this.geometryPass = new GeometryPass(this.scene, this.cameraHandler.activeCam.camera);
		this.jitteredPass = new JitteredPass(this.scene, this.cameraHandler.activeCam.camera, this.container.offsetWidth, this.container.offsetHeight);
		this.saoPass = new SAOPass(this.scene, this.cameraHandler.activeCam.camera, true, true);
		this.taaReprojectionPass = new TAAReprojectionPass(this.scene, this.cameraHandler.activeCam.camera, this.container.offsetWidth, this.container.offsetHeight);
		this.taaReprojectionPass.renderToScreen = true;
		this.composer.addPass(this.geometryPass);
		this.composer.addPass(this.jitteredPass);
		this.composer.addPass(this.saoPass);
		this.composer.addPass(this.taaReprojectionPass);
		
		
		
		this.enableTaa(false);
		this.updateSAO();
		this.enableSAO(true);

		if (showStats) {
			this.stats = new Stats()
			this.container.appendChild(this.stats.dom)
		}

		window.addEventListener('resize', this.onWindowResize.bind(this), false)

		this.mouseOverRenderer = false
		this.renderer.domElement.addEventListener('mouseover', () => {
			this.mouseOverRenderer = true
		})
		this.renderer.domElement.addEventListener('mouseout', () => {
			this.mouseOverRenderer = false
		})

		this.loaders = {}

		this.sectionBox = new SectionBox(this)
		this.sectionBox.off()

		this.sceneManager = new ObjectManager(this)
		this.interactions = new InteractionHandler(this)

		// this.sceneLights()
		this.animate()
		this.onWindowResize()
		this.interactions.zoomExtents()
		this.needsRender = true

		this.inProgressOperations = 0
		const sandbox = new Sandbox(this);
		sandbox.addLightControls();
		sandbox.addSAOControls();
	}

	enableTaa(value) {
		this.geometryPass.enabled = !value;
		this.jitteredPass.enabled = value;
		this.taaReprojectionPass.enabled = value;
		this.taaReprojectionPass.firstRun = value;
		this.saoPass.firstRun = true;
		this.saoPass.renderToScreen = !value;
		this.taaFrames = 0;
		this.needsRender = true;
		if(!value) {
			this.saoPass.screenOutput = true
		}
		else {
			this.saoPass.screenOutput = false;
		}
	}

	movementStopped() {
		if(!this.allowTAA)
			return;
		this.enableTaa(true);
		console.log("movement stopped");
	}

	movementStarted() {
		if(!this.allowTAA)
			return;
		this.enableTaa(false);
		this.taaFrames = 0;
		console.log("movement started");
	}

	sceneLights() {

		const dirLight = new THREE.DirectionalLight(0xffffff, 1);
		dirLight.name = "sun";
		dirLight.position.set(-1, 1.75, 1);
		dirLight.position.multiplyScalar(1);
		this.scene.add(dirLight);

		dirLight.castShadow = true;

		dirLight.shadow.mapSize.width = 2048;
		dirLight.shadow.mapSize.height = 2048;

		const sceneSize = this.sceneBB.getSize(new Vector3());
		const d = Math.max(sceneSize.x, sceneSize.y, sceneSize.z)

		dirLight.shadow.camera.left = -d;
		dirLight.shadow.camera.right = d;
		dirLight.shadow.camera.top = d;
		dirLight.shadow.camera.bottom = -d;
		dirLight.shadow.bias = 0.5;

		dirLight.shadow.camera.near = 5;
		dirLight.shadow.camera.far = 350;
		dirLight.shadow.bias = -0.0001;

		const sunTarget = new Object3D();
		this.scene.add(sunTarget);
		sunTarget.position.set(0, 0, 0);
		dirLight.target = sunTarget;

		this.sun = dirLight;
		this.sunTarget = sunTarget;
		const dirLightHelper = new THREE.DirectionalLightHelper(dirLight, 50, 0xff0000);
		// this.scene.add( dirLightHelper );

		const helper = new THREE.CameraHelper(dirLight.shadow.camera);
		// this.scene.add(helper);

		// let ambientLight = new THREE.AmbientLight(0x888888)
		// this.scene.add(ambientLight)
		// const hemiLight = new THREE.HemisphereLight( 0xffffff, 0xffffff, 0.6 );
		// hemiLight.color.setHSL( 0.6, 1, 0.6 );
		// hemiLight.groundColor.setHSL( 0.095, 1, 0.75 );
		// hemiLight.up.set( 0, 0, 1 )
		// this.scene.add( hemiLight )

	}

	hackedInit() {
		const pmremGenerator = new PMREMGenerator(this.renderer);
		pmremGenerator._equirectShader = new FixedPMREMGenerator().getHackedShader();
		pmremGenerator._compileMaterial(pmremGenerator._equirectShader);
		// pmremGenerator.compileEquirectangularShader();

		let exrCubeRenderTarget, exrBackground;
		new EXRLoader()
			.load('photo_studio_01_1k.exr', (texture) => {
				exrCubeRenderTarget = pmremGenerator.fromEquirectangular(texture);
				exrBackground = exrCubeRenderTarget.texture;
				// this.scene.background = exrBackground;
				// this.scene.environment = exrCubeRenderTarget.texture
				this.envMap = exrCubeRenderTarget.texture;
				texture.dispose();

				this.sceneBB = new Box3();
				const group = this.scene.getObjectByName("GroupedSolidObjects");
				group.traverse((obj) => {
					if (obj.isMesh) {
						const objectBB = new Box3();
						if (!obj.geometry.boundingBox) {
							obj.geometry.computeBoundingBox();
						}
						this.sceneBB.union(obj.geometry.boundingBox);
						obj.castShadow = true;
						obj.receiveShadow = true;
						obj.material.envMap = exrCubeRenderTarget.texture;
						console.log(obj.id);
					}
				})
				
				const sceneSize = this.sceneBB.getSize(new Vector3());
				// this.sun.shadow.camera.left = -200;
				// this.sun.shadow.camera.right = 200
				// this.sun.shadow.camera.top = 200;
				// this.sun.shadow.camera.bottom = -200;
				// this.sun.shadow.camera.updateProjectionMatrix();
				// this.sun.shadow.needsUpdate = true;
				// this.renderer.shadowMap.needsUpdate = true;
				this.sceneLights();
				this.updateDayTime(Sandbox.LIGHT.dayTime);
				this.updateLights();
				this.cameraHandler.activeCam.camera.far = 400;
				this.cameraHandler.activeCam.camera.near = 1;
			});
	}

	updateDayTime(dayTime) {
		const dawnColor = new Color("srgb", [0.882, 0.537, 0.341]);
		const dayColor = new Color("srgb", [0.988, 0.898, 0.439]);
		let lerpColor = dawnColor.range(dayColor, {
			space: "lch", // interpolation space
			outputSpace: "srgb"
		});

		let sunColor;
		const clamp = function (value, min, max) {
			return Math.min(Math.max(value, min), max);
		};
		const lerp = function (t, min, max) {
			return max * t + min * (1 - t);
		}
		const radius = 200;
		const target = new THREE.Vector3(0, 0, 0);
		const yawRange = [0, Math.PI];
		const pitchRange = [-0.41, 0];
		const yaw = lerp(dayTime, yawRange[0], yawRange[1]);
		let pitch;
		if (dayTime <= 0.5) {
			pitch = lerp(dayTime, pitchRange[0], pitchRange[1]);
			sunColor = lerpColor(dayTime)
		} else {
			pitch = lerp(dayTime, pitchRange[1], pitchRange[0]);
			sunColor = lerpColor(1 - dayTime)
		}
		var t = radius * Math.cos(pitch);
		var y = target.y + radius * Math.sin(pitch);
		var x = target.x + t * Math.cos(yaw);
		var z = target.z + t * Math.sin(yaw);
		this.sun.position.set(x, y, z);
		this.sun.color.setRGB(sunColor.coords[0], sunColor.coords[1], sunColor.coords[2]);
		this.needsRender = true;
		this.renderer.shadowMap.needsUpdate = true;
		this.taaFrames = 0;
		this.enableTaa(false);
		this.currentFrameStill = false;
		this.taaFrames = 0;
	}

	updateLights() {
		this.sun.visible = Sandbox.LIGHT.sun;
		this.sun.intensity = Sandbox.LIGHT.sunIntensity;
		const group = this.scene.getObjectByName("GroupedSolidObjects");
		group.traverse((obj) => {
			if (obj.isMesh) {
				if(Sandbox.LIGHT.env) {
					obj.material.envMap = this.envMap;
					obj.material.envMapIntensity = Sandbox.LIGHT.envIntensity;
				}
				else
                    obj.material.envMap = null;
				
			}
		});
		this.needsRender = true;
		this.taaReprojectionPass.firstRun = true;
		this.taaFrames = 0;
	}

	updateSAO() {
		this.saoPass.params.output = Sandbox.AO.outputSAO ? SAOPass.OUTPUT.Default : SAOPass.OUTPUT.Beauty;
		this.saoPass.params.saoBias = Sandbox.AO.saoBias;
		this.saoPass.params.saoIntensity = Sandbox.AO.saoIntensity;
		this.saoPass.params.saoScale = Sandbox.AO.saoScale;
		this.saoPass.params.saoKernelRadius = Sandbox.AO.saoKernelRadius;
		this.saoPass.params.saoMinResolution = Sandbox.AO.saoMinResolution;
		this.saoPass.params.saoBlur = Sandbox.AO.saoBlur;
		this.saoPass.params.saoBlurRadius = Sandbox.AO.saoBlurRadius;
		this.saoPass.params.saoBlurStdDev = Sandbox.AO.saoBlurStdDev;
		this.saoPass.params.saoBlurDepthCutoff = Sandbox.AO.saoBlurDepthCutoff;
		this.needsRender = true;
		this.taaReprojectionPass.firstRun = true;
		this.taaFrames = 0;
	}

	enableSAO(value) {
		this.saoPass.enabled = value;
		this.jitteredPass.swap = !value;
		this.taaReprojectionPass.firstRun = true;
		this.taaFrames = 0;
		// this.geometryPass.renderToScreen = !value;
		// this.taaReprojectionPass.renderToScreen = !value;
		this.needsRender = true;
		this.taaFrames = 0;
	}

	updateCamera(changed) {
		if(!this.sceneBB)
			return;

		const v = new Vector3();
		let d = 0;
		v.set( this.sceneBB.min.x, this.sceneBB.min.y, this.sceneBB.min.z ); // 000
		d = Math.max(this.cameraHandler.activeCam.camera.position.distanceTo(v), d);
		v.set( this.sceneBB.min.x, this.sceneBB.min.y, this.sceneBB.max.z ); // 001
		d = Math.max(this.cameraHandler.activeCam.camera.position.distanceTo(v), d);
		v.set( this.sceneBB.min.x, this.sceneBB.max.y, this.sceneBB.min.z ); // 010
		d = Math.max(this.cameraHandler.activeCam.camera.position.distanceTo(v), d);
		v.set( this.sceneBB.min.x, this.sceneBB.max.y, this.sceneBB.max.z ); // 011
		d = Math.max(this.cameraHandler.activeCam.camera.position.distanceTo(v), d);
		v.set( this.sceneBB.max.x, this.sceneBB.min.y, this.sceneBB.min.z ); // 100
		d = Math.max(this.cameraHandler.activeCam.camera.position.distanceTo(v), d);
		v.set( this.sceneBB.max.x, this.sceneBB.min.y, this.sceneBB.max.z ); // 101
		d = Math.max(this.cameraHandler.activeCam.camera.position.distanceTo(v), d);
		v.set( this.sceneBB.max.x, this.sceneBB.max.y, this.sceneBB.min.z ); // 110
		d = Math.max(this.cameraHandler.activeCam.camera.position.distanceTo(v), d);
		v.set( this.sceneBB.max.x, this.sceneBB.max.y, this.sceneBB.max.z ); // 111
		d = Math.max(this.cameraHandler.activeCam.camera.position.distanceTo(v), d);
		if(this.needsRender)
			// console.log(d);
		
		if(Sandbox.AO.correction) {
			this.cameraHandler.activeCam.camera.far = d;
			this.cameraHandler.activeCam.camera.updateProjectionMatrix();
			this.saoPass.params.saoScale = d;
		}

        const currentCameraPos = new Vector3().copy(this.cameraHandler.activeCam.camera.position);
		const currentCameraQuat = new Quaternion().copy(this.cameraHandler.activeCam.camera.quaternion);
		const currentCameraRadius = this.cameraHandler.controls.distance;
		const dP = currentCameraPos.sub(this.lastCameraPosition).length();
		const dQ = currentCameraQuat.angleTo(this.lastCameraRotation);
		const dR = Math.abs(currentCameraRadius - this.lastCameraRadius);
		this.lastCameraPosition.copy(this.cameraHandler.activeCam.camera.position);
		this.lastCameraRotation.copy(this.cameraHandler.activeCam.camera.quaternion);
		this.lastCameraRadius = currentCameraRadius;
		const currentFrameStill = dP < 0.001 && dQ < 0.0001 && dR < 0.0001;
		/** 'CameraControls' reports rubbish on camera movement, so I have to do all this mess */
		if(currentFrameStill) {
			if(!this.cameraStopped)
				this.framesStillCount++;
			else {
				this.taaFrames++;
			}
		}
		else {
			if(this.cameraStopped)
				this.framesStillCount--;
			if((this.cameraStopped && this.framesStillCount < 0) || dR != 0) {
				this.cameraStopped = false;
				this.movementStarted();
			}
		}

		if(this.framesStillCount >= 3) {
			if(!this.cameraStopped) {
				this.cameraStopped = true;
				this.movementStopped();
			}
		}
	}

	onWindowResize() {
		this.renderer.setSize(this.container.offsetWidth, this.container.offsetHeight);
		this.composer.setSize(this.container.offsetWidth, this.container.offsetHeight);
		// this.composer.setSize( this.container.offsetWidth, this.container.offsetHeight )
		this.needsRender = true
		this.taaFrames = 0;
		this.taaReprojectionPass.firstRun = true;
	}

	animate() {
		const delta = this.clock.getDelta()

		const hasControlsUpdated = this.cameraHandler.controls.update(delta)
		// const hasOrthoControlsUpdated = this.cameraHandler.cameras[1].controls.update( delta )
		this.updateCamera(hasControlsUpdated);

		requestAnimationFrame(this.animate.bind(this))
		
		// you can skip this condition to render though
		if (hasControlsUpdated || this.needsRender) {
			this.needsRender = false
			if (this.stats) this.stats.begin()
			this.render()
			if (this.stats && document.getElementById('info-draws'))
	document.getElementById('info-draws').textContent = '' + this.renderer.info.render.calls
			if (this.stats) this.stats.end()
		}

	}

	render() {
		// this.renderer.render( this.scene, this.cameraHandler.activeCam.camera )
		this.composer.render();
		this.needsRender = true;
		if(this.taaFrames > 64 && this.cameraStopped) {
			this.needsRender = false;
		}
	}

	toggleSectionBox() {
		this.sectionBox.toggle()
	}

	sectionBoxOff() {
		this.sectionBox.off()
	}

	sectionBoxOn() {
		this.sectionBox.on()
	}

	zoomExtents(fit, transition) {
		this.interactions.zoomExtents(fit, transition)
	}

	setProjectionMode(mode) {
		this.cameraHandler.activeCam = mode
	}

	toggleCameraProjection() {
		this.cameraHandler.toggleCameras()
	}

	async loadObject(url, token, enableCaching = true) {
		try {
			if (++this.inProgressOperations === 1) this.emit('busy', true)

			let loader = new ViewerObjectLoader(this, url, token, enableCaching)
			this.loaders[url] = loader
			await loader.load();
			this.hackedInit();
		} finally {
			if (--this.inProgressOperations === 0) this.emit('busy', false)
		}

	}

	async cancelLoad(url, unload = false) {
		this.loaders[url].cancelLoad()
		if (unload) {
			await this.unloadObject(url)
		}
		return
	}

	async unloadObject(url) {
		try {
			if (++this.inProgressOperations === 1) this.emit('busy', true)

			await this.loaders[url].unload()
			delete this.loaders[url]
		} finally {
			if (--this.inProgressOperations === 0) this.emit('busy', false)
		}
	}

	async unloadAll() {
		for (let key of Object.keys(this.loaders)) {
			await this.loaders[key].unload()
			delete this.loaders[key]
		}
		await this.applyFilter(null)
		return
	}

	async applyFilter(filter) {
		try {
			if (++this.inProgressOperations === 1) this.emit('busy', true)

			this.interactions.deselectObjects()
			return await this.sceneManager.sceneObjects.applyFilter(filter)
		} finally {
			if (--this.inProgressOperations === 0) this.emit('busy', false)
		}

	}

	getObjectsProperties(includeAll = true) {
		return this.sceneManager.sceneObjects.getObjectsProperties(includeAll)
	}

	dispose() {
		// TODO: currently it's easier to simply refresh the page :)
	}
}
