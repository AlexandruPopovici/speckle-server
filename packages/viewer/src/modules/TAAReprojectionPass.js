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
	ZeroFactor,
    Matrix4
} from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { SAOShader } from './SAOShader.js';
import { DepthLimitedBlurShader } from 'three/examples/jsm/shaders/DepthLimitedBlurShader.js';
import { BlurShaderUtils } from 'three/examples/jsm/shaders/DepthLimitedBlurShader.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';
import { UnpackDepthRGBAShader } from 'three/examples/jsm/shaders/UnpackDepthRGBAShader.js';
import { CopyShaderGamma } from './CopyShaderGamma.js';
import { AdditiveBlending } from 'three';
/**
 * SAO implementation inspired from bhouston previous SAO work
 */

class TAAReprojectionPass extends Pass {

	constructor( scene, camera, resolution = new Vector2( 256, 256 ) ) {

		super();

        this.scene = scene;
		this.camera = camera;

		this.resolution = new Vector2( resolution.x, resolution.y );
        this.oldClearColor = new Color();
		this.resolution = new Vector2( resolution.x, resolution.y );
        this.projectionBuffer = new Matrix4();

        this.geometryRenderTarget = new WebGLRenderTarget( this.resolution.x, this.resolution.y, {
			minFilter: LinearFilter,
			magFilter: LinearFilter,
			format: RGBAFormat
		} );

		this.reprojectionRT0 = new WebGLRenderTarget( this.resolution.x, this.resolution.y, {
			minFilter: LinearFilter,
			magFilter: LinearFilter,
			format: RGBAFormat
		} );
        this.reprojectionRT1 = new WebGLRenderTarget( this.resolution.x, this.resolution.y, {
			minFilter: LinearFilter,
			magFilter: LinearFilter,
			format: RGBAFormat
		} );
		
        this.fsQuad = new FullScreenQuad( null );

        this.materialCopy = new ShaderMaterial( {
			uniforms: UniformsUtils.clone( CopyShader.uniforms ),
			vertexShader: CopyShader.vertexShader,
			fragmentShader: CopyShader.fragmentShader,
			blending: NoBlending
		} );
        this.materialCopy.blending = NoBlending;
        this.materialCopy.uniforms[ 'tDiffuse' ].value = this.reprojectionRT0;
        this.materialCopy.needsUpdate = true;

        this.reprojectionMaterial = new ShaderMaterial({
            uniforms: {
                'tDiffuse': { value: null },
                'tLastFrame': { value: null },
                'width': { value: 0. },
                'height': { value: 0. }
        
            },
            transparent: true,
            blending: NoBlending,
            depthTest: false,
            depthWrite: false,
        
            vertexShader: `
                varying vec2 Uv;
                void main() {
                    Uv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }`,
        
            fragmentShader: `
                uniform float height;
                uniform float width;
                uniform sampler2D tDiffuse;
                // uniform sampler2D tMotion;
                uniform sampler2D tLastFrame;
                varying vec2 Uv;

                #define LuminanceEncodeApprox vec3(0.2126, 0.7152, 0.0722)
                float getLuminance(vec3 color) {
                    return clamp(dot(color, LuminanceEncodeApprox), 0., 1.);
                }
                

                void main() {
                    vec4 texel = texture2D(tDiffuse, Uv);
                    // vec4 pixelMovement = texture2D(tMotion, Uv);
                    vec2 oldPixelUv = Uv;// - ((pixelMovement.xy * 2.0) - 1.0);
                    vec4 oldTexel = texture2D(tLastFrame, oldPixelUv);
                    // Use simple neighbor clamping
                    vec4 maxNeighbor = vec4(0.0, 0.0, 0.0, 1.0);
                    vec4 minNeighbor = vec4(1.0);
                    vec4 average = vec4(0.0);
                    for (int x = -1; x <= 1; x++) {
                        for (int y = -1; y <= 1; y++) {
                            vec2 neighborUv = Uv + vec2(float(x) / width, float(y) / height);
                            vec4 neighborTexel = texture2D(tDiffuse, neighborUv);
                            maxNeighbor = max(maxNeighbor, neighborTexel);
                            minNeighbor = min(minNeighbor, neighborTexel);
                            average += neighborTexel / 9.0;
                        }
                    }
                float lum0 = getLuminance(texel.rgb);
                float lum1 = getLuminance(oldTexel.rgb);
            
                float unbiased_diff = abs(lum0 - lum1) / max(lum0, max(lum1, 0.2));
                float unbiased_weight = 1.0 - unbiased_diff;
                float unbiased_weight_sqr = unbiased_weight * unbiased_weight;
                float k_feedback = mix(0.8800, 0.9700, unbiased_weight_sqr);
                
                // UE Method to get rid of flickering. Weight frame mixing amount
                // based on local contrast.
                float contrast = distance(average, texel);
                float weight = 0.05 * contrast;
            
                // float combineMotionBlend = max(motionSample.w, motionBlendFactor);
                float blendFactor = mix(1. - weight, k_feedback, 1.);
                vec4 compositeColor = mix(texel, oldTexel, blendFactor);
                
                 gl_FragColor = compositeColor;
                }`
        });
        this.reprojectionMaterial.needsUpdate = true;

        this.materialCopyGamma = new ShaderMaterial( {
			uniforms: UniformsUtils.clone( CopyShader.uniforms ),
			vertexShader: CopyShaderGamma.vertexShader,
			fragmentShader: CopyShaderGamma.fragmentShader,
			blending: NoBlending
		} );

        this.firstRun = true;

        this.jitterIndex = 0;
        // Use Halton Sequence [2, 3] for jitter amounts (Based on UE and
        // Uncharted Presentations)
        this.jitterOffsets = this.generateHaltonJiters(16);
    }


	render( renderer, writeBuffer, readBuffer/*, deltaTime, maskActive*/ ) {

        // let oldClearAlpha, oldAutoClear;
		// renderer.getClearColor( this.oldClearColor );
		// oldClearAlpha = renderer.getClearAlpha();
		// oldAutoClear = renderer.autoClear;
		
        // renderer.autoClear = false;
		// renderer.setClearColor( 0x000000 );
		// renderer.setRenderTarget( this.geometryRenderTarget );
		// renderer.clear();
        // let [jitterX, jitterY] = this.jitterOffsets[this.jitterIndex];
        // this.camera.projectionMatrix.elements[8] = jitterX / writeBuffer.width;
        // this.camera.projectionMatrix.elements[9] = jitterY / writeBuffer.height ;
		// renderer.render( this.scene, this.camera );
        // this.camera.updateProjectionMatrix();
        // this.jitterIndex = (this.jitterIndex + 1) % this.jitterOffsets.length;

        // // renderer.setRenderTarget( null );
        // // renderer.clear();
		// // this.fsQuad.material = this.materialCopy;
		// // this.fsQuad.render( renderer );

		// // restore original state
		// renderer.autoClear = oldAutoClear;
		// renderer.setClearColor( this.oldClearColor );
		// renderer.setClearAlpha( oldClearAlpha );

        renderer.autoclear = false;
        if(this.firstRun) {
            renderer.setRenderTarget( this.reprojectionRT1 );
            renderer.clear();
            this.materialCopy.uniforms[ 'tDiffuse' ].value = readBuffer;//this.geometryRenderTarget.texture;
            this.materialCopy.needsUpdate = true;
            this.fsQuad.material = this.materialCopy;
            this.fsQuad.render( renderer );
            this.firstRun = false;
        }
		renderer.setClearColor( 0xffffff );
        renderer.setRenderTarget( this.reprojectionRT0 );
        renderer.clear();
        this.reprojectionMaterial.uniforms['tLastFrame'].value = this.reprojectionRT1.texture;
        this.reprojectionMaterial.uniforms['tDiffuse'].value = readBuffer;//this.geometryRenderTarget.texture;
        this.reprojectionMaterial.uniforms['width'].value = this.geometryRenderTarget.width;
        this.reprojectionMaterial.uniforms['height'].value = this.geometryRenderTarget.height;
		this.fsQuad.material = this.reprojectionMaterial;
		this.fsQuad.render( renderer );

        renderer.setRenderTarget( this.reprojectionRT1 );
        renderer.clear();
        this.materialCopy.uniforms[ 'tDiffuse' ].value = this.reprojectionRT0.texture;
        this.materialCopy.needsUpdate = true;
        this.fsQuad.material = this.materialCopy;
        this.fsQuad.render( renderer );

        renderer.setRenderTarget( this.renderToScreen ? null : writeBuffer );
        this.materialCopyGamma.uniforms[ 'tDiffuse' ].value = this.reprojectionRT0.texture;
        this.fsQuad.material = this.materialCopyGamma;
        this.fsQuad.render( renderer );
	}


	setSize( width, height ) {
		this.reprojectionRT0.setSize( width, height );
        this.reprojectionRT1.setSize( width, height );
        this.geometryRenderTarget.setSize( width, height );
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

}


export { TAAReprojectionPass };
