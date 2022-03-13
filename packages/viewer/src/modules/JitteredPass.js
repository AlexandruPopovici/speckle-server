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

class JitteredPass extends Pass {

	constructor( scene, camera, resolution = new Vector2( 256, 256 ) ) {

		super();

		this.scene = scene;
		this.camera = camera;

		this.clear = true;
		this.needsSwap = false;
		this.swap = false;

        this.oldClearColor = new Color();
		this.resolution = new Vector2( resolution.x, resolution.y );
        this.projectionBuffer = new Matrix4();

		this.geometryRenderTarget = new WebGLRenderTarget( this.resolution.x, this.resolution.y, {
			minFilter: LinearFilter,
			magFilter: LinearFilter,
			format: RGBAFormat
		} );
		const depthTexture = new DepthTexture();
		depthTexture.type = UnsignedShortType;

		this.geometryRenderTarget.depthTexture = depthTexture;
		// this.geometryRenderTarget.depthBuffer = true;
		
        this.fsQuad = new FullScreenQuad( null );

        this.materialCopy = new ShaderMaterial( {
			uniforms: UniformsUtils.clone( CopyShader.uniforms ),
			vertexShader: CopyShader.vertexShader,
			fragmentShader: CopyShader.fragmentShader,
			blending: NoBlending
		} );
        this.materialCopy.blending = NoBlending;
        this.materialCopy.uniforms[ 'tDiffuse' ].value = this.geometryRenderTarget;
        this.materialCopy.needsUpdate = true;
		// this.materialCopy.transparent = true;
		// this.materialCopy.depthTest = false;
		// this.materialCopy.depthWrite = false;
		// this.materialCopy.blending = CustomBlending;
		// this.materialCopy.blendSrc = DstColorFactor;
		// this.materialCopy.blendDst = ZeroFactor;
		// this.materialCopy.blendEquation = AddEquation;
		// this.materialCopy.blendSrcAlpha = DstAlphaFactor;
		// this.materialCopy.blendDstAlpha = ZeroFactor;
		// this.materialCopy.blendEquationAlpha = AddEquation;
		// let depthTexture;

		// if ( this.supportsDepthTextureExtension ) {

		// 	depthTexture = new DepthTexture();
		// 	depthTexture.type = UnsignedShortType;

		// 	this.beautyRenderTarget.depthTexture = depthTexture;
		// 	this.beautyRenderTarget.depthBuffer = true;

		// }
        this.jitterIndex = 0;
        // Use Halton Sequence [2, 3] for jitter amounts (Based on UE and
        // Uncharted Presentations)
        this.jitterOffsets = this.generateHaltonJiters(16);
	}

    /**
     * Generate a number in the Halton Sequence at a given index. This is
     * shamelessly stolen from the pseudocode on the Wikipedia page
     * 
     * @param base the base to use for the Halton Sequence
     * @param index the index into the sequence
     */
    haltonNumber = function(base, index) {
        let result = 0;
        let f = 1;
        while (index > 0) {
            f /= base;
            result += f * (index % base);
            index = Math.floor(index / base);
        }

        return result;
    }

    generateHaltonJiters = function(length) {
        let jitters = [];
    
        for (let i = 1; i <= length; i++)
            jitters.push([(this.haltonNumber(2, i) - 0.5) * 2, (this.haltonNumber(3, i) - 0.5) * 2]);
    
        return jitters;
    }

	render( renderer, writeBuffer, readBuffer/*, deltaTime, maskActive*/ ) {

        let oldClearAlpha, oldAutoClear;
		renderer.getClearColor( this.oldClearColor );
		oldClearAlpha = renderer.getClearAlpha();
		oldAutoClear = renderer.autoClear;
		
        renderer.autoClear = false;
		renderer.setClearColor( 0xffffff );
		renderer.setRenderTarget( this.swap ? readBuffer : writeBuffer );
		renderer.clear();
        let [jitterX, jitterY] = this.jitterOffsets[this.jitterIndex];
        this.camera.projectionMatrix.elements[8] = jitterX / writeBuffer.width;
        this.camera.projectionMatrix.elements[9] = jitterY / writeBuffer.height ;
		renderer.render( this.scene, this.camera );
        this.camera.updateProjectionMatrix();
        this.jitterIndex = (this.jitterIndex + 1) % this.jitterOffsets.length;

        // renderer.setRenderTarget( null );
        // renderer.clear();
		// this.fsQuad.material = this.materialCopy;
		// this.fsQuad.render( renderer );

		// restore original state
		renderer.autoClear = oldAutoClear;
		renderer.setClearColor( this.oldClearColor );
		renderer.setClearAlpha( oldClearAlpha );
        
	}


	setSize( width, height ) {
		this.geometryRenderTarget.setSize( width, height );
	}

}


export { JitteredPass };
