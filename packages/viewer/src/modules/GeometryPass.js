import {
	AddEquation,
	Color,
	CustomBlending,
	DepthTexture,
	DstAlphaFactor,
	DstColorFactor,
	LinearFilter,
	MeshDepthMaterial,
	MeshNormalMaterial,
	NearestFilter,
	NoBlending,
	RGBADepthPacking,
	RGBAFormat,
	ShaderMaterial,
	UniformsUtils,
	UnsignedShortType,
	Vector2,
	WebGLRenderTarget,
	ZeroFactor
} from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { SAOShader } from './SAOShader.js';
import { DepthLimitedBlurShader } from 'three/examples/jsm/shaders/DepthLimitedBlurShader.js';
import { BlurShaderUtils } from 'three/examples/jsm/shaders/DepthLimitedBlurShader.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';
import { UnpackDepthRGBAShader } from 'three/examples/jsm/shaders/UnpackDepthRGBAShader.js';
import { Matrix4 } from 'three';

/**
 * SAO implementation inspired from bhouston previous SAO work
 */

class GeometryPass extends Pass {

	constructor( scene, camera, resolution = new Vector2( 256, 256 ) ) {

		super();

		this.scene = scene;
		this.camera = camera;

		this.clear = true;
		this.needsSwap = false;

        this.oldClearColor = new Color();
	}

    
	render( renderer, writeBuffer, readBuffer/*, deltaTime, maskActive*/ ) {

        let oldClearAlpha, oldAutoClear;
		renderer.getClearColor( this.oldClearColor );
		oldClearAlpha = renderer.getClearAlpha();
		oldAutoClear = renderer.autoClear;
		
        renderer.autoClear = false;
		renderer.setClearColor( 0xffffff );
		renderer.setRenderTarget( this.renderToScreen ? null : writeBuffer );
		renderer.clear();
		renderer.render( this.scene, this.camera );

		// restore original state
		renderer.autoClear = oldAutoClear;
		renderer.setClearColor( this.oldClearColor );
		renderer.setClearAlpha( oldClearAlpha );
        
	}


	setSize( width, height ) {

	}

}


export { GeometryPass };
