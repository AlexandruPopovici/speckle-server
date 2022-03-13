import { Pane } from 'tweakpane';
import * as THREE from 'three'
import { SSAOPass } from 'three/examples//jsm/postprocessing/SSAOPass.js';
import { SAOPass } from 'three/examples/jsm/postprocessing/SAOPass.js';

export default class Sandbox {

	constructor(viewer) {
        const parent = document.getElementsByClassName('row');
        this.viewer = viewer;
		this.pane = new Pane({ 
            title: 'Sandbox', 
            expanded: true,
            container: parent[1]
        });
        const pane = document.getElementsByClassName('tp-rotv tp-cntv tp-rotv-expanded tp-rotv-cpl');
		pane[0].style.width = "300px"; 
        pane[0].style.position = "absolute"
        pane[0].style.right = 0;

        

	}

    addLightControls() {
        const lightFolder = this.pane.addFolder({
            title: "Light",
            expanded: true
        });
        lightFolder.addInput(Sandbox.LIGHT, 'dayTime', {
            min: 0,
            max: 1,
            label: "DayTime"
        }).on('change', (ev) => {
            this.viewer.updateDayTime(Sandbox.LIGHT.dayTime);
        })
        lightFolder.addInput(Sandbox.LIGHT, 'sun', {
            label: "Enable Sun"
        }).on('change', (ev) => {
            this.viewer.updateLights();
        })
        lightFolder.addInput(Sandbox.LIGHT, 'sunIntensity', {
            min: 0.0,
            max: 5,
            label: "Sun Intensity"
        }).on('change', (ev) => {
            this.viewer.updateLights();
        })
        lightFolder.addInput(Sandbox.LIGHT, 'env', {
            label: "Enable Diffuse Probe"
        }).on('change', (ev) => {
            this.viewer.updateLights();
        })
        lightFolder.addInput(Sandbox.LIGHT, 'envIntensity', {
            min: 0.0,
            max: 3,
            label: "Diffuse Probe Intensity"
        }).on('change', (ev) => {
            this.viewer.updateLights();
        })
    }



    addSAOControls() {
        const saoFolder = this.pane.addFolder({
            title: "Params",
            expanded: true
        });

        saoFolder.addInput(this.viewer.renderer, 'toneMappingExposure', {
            min: 0.0,
            max: 5,
            label: "Exposure"
        }).on('change', (ev) => {
            this.viewer.needsRender = true;
            this.viewer.taaReprojectionPass.firstRun = true;
            this.viewer.taaFrames = 0;
        })
        
        saoFolder.addInput(Sandbox.AO, 'outputSAO', {
            label: "EnableSAO"
        }).on('change', (ev) => {
            this.viewer.enableSAO(ev.value);
        })
        // saoFolder.addInput(Sandbox.AO, 'saoBias', {
        //     min: -10,
        //     max: 10,
        // }).on('change', (ev) => {
        //     this.viewer.updateSAO();
        // })
        saoFolder.addInput(Sandbox.AO, 'saoIntensity', {
            min: 0,
            max: 3,
            label: "SAO Intensity"
        }).on('change', (ev) => {
            this.viewer.updateSAO();
        })
        // saoFolder.addInput(Sandbox.AO, 'saoScale', {
        //     min: 0,
        //     max: 1000,
        // }).on('change', (ev) => {
        //     this.viewer.updateSAO();
        // })
        // saoFolder.addInput(Sandbox.AO, 'saoKernelRadius', {
        //     min: 0,
        //     max: 100,
        // }).on('change', (ev) => {
        //     this.viewer.updateSAO();
        // })
        // saoFolder.addInput(Sandbox.AO, 'saoMinResolution', {
        //     min: 0,
        //     max: 1,
        // }).on('change', (ev) => {
        //     this.viewer.updateSAO();
        // })
        // saoFolder.addInput(Sandbox.AO, 'saoBlur', {
        // }).on('change', (ev) => {
        //     this.viewer.updateSAO();
        // })
        // saoFolder.addInput(Sandbox.AO, 'saoBlurRadius', {
        //     min: 0,
        //     max: 20,
        // }).on('change', (ev) => {
        //     this.viewer.updateSAO();
        // })
        // saoFolder.addInput(Sandbox.AO, 'saoBlurStdDev', {
        //     min: 0.5,
        //     max: 150,
        // }).on('change', (ev) => {
        //     this.viewer.updateSAO();
        // })
        // saoFolder.addInput(Sandbox.AO, 'saoBlurDepthCutoff', {
        //     min: 0.0,
        //     max: 0.0001,
        // }).on('change', (ev) => {
        //     this.viewer.updateSAO();
        //     console.log(ev.value);
        // })

        saoFolder.addInput(Sandbox.LIGHT, 'taa', {
            label: "Enable TAA"
        }).on('change', (ev) => {
            this.viewer.enableTaa(ev.value);
            this.viewer.allowTAA = ev.value;
        })
    }
 }

 Sandbox.LIGHT = {
    dayTime : 0.7,
    sun: true,
    sunIntensity: 1.5,
    env: true,
    envIntensity: 0.25,
    taa: true
}

Sandbox.AO = {
    outputSAO: true,
    saoBias: 0, 
    saoIntensity: 1.5,
    saoScale: 434,
    saoKernelRadius: 6.52,
    saoMinResolution: 0,
    saoBlur: true,
    saoBlurRadius: 2,
    saoBlurStdDev: 4,
    saoBlurDepthCutoff: 0.00007,
    correction: true
}
