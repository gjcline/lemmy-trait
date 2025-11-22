import * as THREE from 'three';

export class DotShaderBackground {
    constructor(container) {
        this.container = container;
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance'
        });

        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight, true);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.NoToneMapping;

        // Ensure canvas fills container
        this.renderer.domElement.style.width = '100%';
        this.renderer.domElement.style.height = '100%';

        container.appendChild(this.renderer.domElement);

        this.mouse = new THREE.Vector2(-1, -1);
        this.mouseTrail = [];
        this.trailTexture = this.createTrailTexture();

        this.clock = new THREE.Clock();
        this.setupShader();
        this.setupEventListeners();
        this.animate();
    }

    createTrailTexture() {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;

        this.trailCanvas = canvas;
        this.trailCtx = ctx;

        return texture;
    }

    updateTrailTexture() {
        const ctx = this.trailCtx;
        const canvas = this.trailCanvas;

        // Fade effect
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw mouse trail
        if (this.mouseTrail.length > 0) {
            ctx.fillStyle = 'rgba(255, 255, 255, 1)';

            this.mouseTrail = this.mouseTrail.filter(point => {
                point.age++;
                const alpha = Math.max(0, 1 - point.age / 30);

                if (alpha > 0) {
                    const size = 80 * alpha;
                    const gradient = ctx.createRadialGradient(
                        point.x * canvas.width,
                        (1 - point.y) * canvas.height,
                        0,
                        point.x * canvas.width,
                        (1 - point.y) * canvas.height,
                        size
                    );
                    gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
                    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

                    ctx.fillStyle = gradient;
                    ctx.beginPath();
                    ctx.arc(
                        point.x * canvas.width,
                        (1 - point.y) * canvas.height,
                        size,
                        0,
                        Math.PI * 2
                    );
                    ctx.fill();

                    return true;
                }
                return false;
            });
        }

        this.trailTexture.needsUpdate = true;
    }

    setupShader() {
        const vertexShader = `
            void main() {
                gl_Position = vec4(position.xy, 0.0, 1.0);
            }
        `;

        const fragmentShader = `
            uniform float time;
            uniform vec2 resolution;
            uniform vec3 dotColor;
            uniform vec3 bgColor;
            uniform sampler2D mouseTrail;
            uniform float rotation;
            uniform float gridSize;
            uniform float dotOpacity;

            vec2 rotate(vec2 uv, float angle) {
                float s = sin(angle);
                float c = cos(angle);
                mat2 rotationMatrix = mat2(c, -s, s, c);
                return rotationMatrix * (uv - 0.5) + 0.5;
            }

            vec2 coverUv(vec2 uv) {
                vec2 s = resolution.xy / max(resolution.x, resolution.y);
                vec2 newUv = (uv - 0.5) * s + 0.5;
                return clamp(newUv, 0.0, 1.0);
            }

            float sdfCircle(vec2 p, float r) {
                return length(p - 0.5) - r;
            }

            void main() {
                vec2 screenUv = gl_FragCoord.xy / resolution;
                vec2 uv = coverUv(screenUv);

                vec2 rotatedUv = rotate(uv, rotation);

                vec2 gridUv = fract(rotatedUv * gridSize);
                vec2 gridUvCenterInScreenCoords = rotate((floor(rotatedUv * gridSize) + 0.5) / gridSize, -rotation);

                float baseDot = sdfCircle(gridUv, 0.25);

                float screenMask = smoothstep(0.0, 1.0, 1.0 - uv.y);
                vec2 centerDisplace = vec2(0.7, 1.1);
                float circleMaskCenter = length(uv - centerDisplace);
                float circleMaskFromCenter = smoothstep(0.5, 1.0, circleMaskCenter);

                float combinedMask = screenMask * circleMaskFromCenter;
                float circleAnimatedMask = sin(time * 2.0 + circleMaskCenter * 10.0);

                float mouseInfluence = texture2D(mouseTrail, gridUvCenterInScreenCoords).r;

                float scaleInfluence = max(mouseInfluence * 0.5, circleAnimatedMask * 0.3);

                float dotSize = min(pow(circleMaskCenter, 2.0) * 0.3, 0.3);

                float sdfDot = sdfCircle(gridUv, dotSize * (1.0 + scaleInfluence * 0.5));

                float smoothDot = smoothstep(0.05, 0.0, sdfDot);

                float opacityInfluence = max(mouseInfluence * 50.0, circleAnimatedMask * 0.5);

                vec3 composition = mix(bgColor, dotColor, smoothDot * combinedMask * dotOpacity * (1.0 + opacityInfluence));

                gl_FragColor = vec4(composition, 1.0);
            }
        `;

        this.material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                time: { value: 0 },
                resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
                dotColor: { value: new THREE.Color('#FFFFFF') },
                bgColor: { value: new THREE.Color('#0a0a0a') },
                mouseTrail: { value: this.trailTexture },
                rotation: { value: 0 },
                gridSize: { value: 100 },
                dotOpacity: { value: 0.035 }
            }
        });

        const geometry = new THREE.PlaneGeometry(2, 2);
        this.mesh = new THREE.Mesh(geometry, this.material);
        this.scene.add(this.mesh);
    }

    setupEventListeners() {
        window.addEventListener('resize', () => this.onResize());
        window.addEventListener('mousemove', (e) => this.onMouseMove(e));
        window.addEventListener('touchmove', (e) => this.onTouchMove(e));
    }

    onResize() {
        this.renderer.setSize(window.innerWidth, window.innerHeight, true);
        this.renderer.domElement.style.width = '100%';
        this.renderer.domElement.style.height = '100%';
        this.material.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
    }

    onMouseMove(event) {
        // Since canvas is fixed full viewport, use window dimensions
        this.mouse.x = event.clientX / window.innerWidth;
        this.mouse.y = 1 - (event.clientY / window.innerHeight);

        this.mouseTrail.push({
            x: this.mouse.x,
            y: this.mouse.y,
            age: 0
        });

        // Limit trail length
        if (this.mouseTrail.length > 50) {
            this.mouseTrail.shift();
        }
    }

    onTouchMove(event) {
        if (event.touches.length > 0) {
            const touch = event.touches[0];
            // Since canvas is fixed full viewport, use window dimensions
            this.mouse.x = touch.clientX / window.innerWidth;
            this.mouse.y = 1 - (touch.clientY / window.innerHeight);

            this.mouseTrail.push({
                x: this.mouse.x,
                y: this.mouse.y,
                age: 0
            });
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        this.material.uniforms.time.value = this.clock.getElapsedTime();
        this.updateTrailTexture();

        this.renderer.render(this.scene, this.camera);
    }

    destroy() {
        window.removeEventListener('resize', () => this.onResize());
        window.removeEventListener('mousemove', (e) => this.onMouseMove(e));
        window.removeEventListener('touchmove', (e) => this.onTouchMove(e));

        this.renderer.dispose();
        this.material.dispose();
        this.trailTexture.dispose();

        if (this.container.contains(this.renderer.domElement)) {
            this.container.removeChild(this.renderer.domElement);
        }
    }
}
