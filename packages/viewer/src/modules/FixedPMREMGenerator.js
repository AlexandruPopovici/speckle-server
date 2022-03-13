import { PMREMGenerator, RawShaderMaterial, NoBlending, Vector2 } from 'three'

export class FixedPMREMGenerator {

    getHackedShader() {
        const texelSize = new Vector2( 1, 1 );
        const shaderMaterial = new RawShaderMaterial( {
    
            name: 'EquirectangularToCubeUV',
    
            uniforms: {
                'envMap': { value: null },
                'texelSize': { value: texelSize },
                'inputEncoding': { value: 0 }
            },
    
            vertexShader: `
            precision mediump float;
            precision mediump int;
    
            attribute vec3 position;
            attribute vec2 uv;
            attribute float faceIndex;
    
            varying vec3 vOutputDirection;
            
            mat3 rotation3dX(float angle) {
                float s = sin(angle);
                float c = cos(angle);
            
                return mat3(
                    1.0, 0.0, 0.0,
                    0.0, c, s,
                    0.0, -s, c
                );
            }

            const float HALF_PI = 1.570796327;

            // RH coordinate system; PMREM face-indexing convention
            vec3 getDirection( vec2 uv, float face ) {
    
                uv = 2.0 * uv - 1.0;
    
                vec3 direction = vec3( uv, 1.0 );
    
                if ( face == 0.0 ) {
    
                    direction = direction.zyx * rotation3dX(HALF_PI);; // ( 1, v, u ) pos x
    
                } else if ( face == 1.0 ) {
    
                    direction = direction.xzy * rotation3dX(-HALF_PI);;
                    direction.xz *= -1.0; // ( -u, 1, -v ) pos y
    
                } else if ( face == 2.0 ) {
    
                    direction.x *= -1.0;
                    direction = direction * rotation3dX(HALF_PI); // ( -u, v, 1 ) pos z
    
                } else if ( face == 3.0 ) {
    
                    direction = direction.zyx * rotation3dX(-HALF_PI);;
                    direction.xz *= -1.0; // ( -1, v, -u ) neg x
    
                } else if ( face == 4.0 ) {
    
                    direction = direction.xzy * rotation3dX(-HALF_PI);;
                    direction.xy *= -1.0; // ( -u, -1, v ) neg y
    
                } else if ( face == 5.0 ) {
    
                    direction.z *= -1.0; // ( u, v, -1 ) neg z
                    direction = direction * rotation3dX(HALF_PI);
    
                }
    
                return direction;
    
            }
    
            void main() {
    
                vOutputDirection = getDirection( uv, faceIndex );
                gl_Position = vec4( position, 1.0 );
    
            }`,
    
            fragmentShader: /* glsl */`
    
                precision mediump float;
                precision mediump int;
    
                varying vec3 vOutputDirection;
    
                uniform sampler2D envMap;
                uniform vec2 texelSize;
    
                uniform int inputEncoding;

                #include <encodings_pars_fragment>

                vec4 inputTexelToLinear( vec4 value ) {

                    if ( inputEncoding == 0 ) {

                        return value;

                    } else {

                        return sRGBToLinear( value );

                    }

                }

                vec4 envMapTexelToLinear( vec4 color ) {

                    return inputTexelToLinear( color );

                }
    
                #include <common>
    
                void main() {
    
                    gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
    
                    vec3 outputDirection = normalize( vOutputDirection );
                    vec2 uv = equirectUv( outputDirection );
    
                    vec2 f = fract( uv / texelSize - 0.5 );
                    uv -= f * texelSize;
                    vec3 tl = envMapTexelToLinear( texture2D ( envMap, uv ) ).rgb;
                    uv.x += texelSize.x;
                    vec3 tr = envMapTexelToLinear( texture2D ( envMap, uv ) ).rgb;
                    uv.y += texelSize.y;
                    vec3 br = envMapTexelToLinear( texture2D ( envMap, uv ) ).rgb;
                    uv.x -= texelSize.x;
                    vec3 bl = envMapTexelToLinear( texture2D ( envMap, uv ) ).rgb;
    
                    vec3 tm = mix( tl, tr, f.x );
                    vec3 bm = mix( bl, br, f.x );
                    gl_FragColor.rgb = mix( tm, bm, f.y );
    
                }
            `,
    
            blending: NoBlending,
            depthTest: false,
            depthWrite: false
    
        } );
    
        return shaderMaterial;
    }
}