/**
 * Realistic Water Ripples - Based on jQuery Ripples and Shadertoy water physics
 * Creates authentic water surface simulation with proper wave physics
 * No jQuery dependency - pure vanilla JavaScript
 */

class RealisticWaterRipples {
    constructor(element, options = {}) {
        this.element = element;
        this.config = {
            resolution: 512,
            dropRadius: 20,
            perturbance: 0.08,        // Increased for more visible effect
            interactive: true,
            crossOrigin: '',
            imageUrl: null,
            initiallyVisible: true,   // New option for initial visibility
            initiallyRunning: true,   // New option for initial running state
            ...options
        };

        // WebGL context and resources
        this.canvas = null;
        this.gl = null;
        this.textures = [];
        this.framebuffers = [];
        this.programs = {};
        this.bufferWriteIndex = 0;
        this.bufferReadIndex = 1;
        
        // Background texture
        this.backgroundTexture = null;
        this.backgroundWidth = 0;
        this.backgroundHeight = 0;
        
        // State
        this.running = this.config.initiallyRunning;
        this.visible = this.config.initiallyVisible;
        this.destroyed = false;
        
        // Bind methods
        this.step = this.step.bind(this);
        this.handlePointerEvent = this.handlePointerEvent.bind(this);
        this.handleResize = this.handleResize.bind(this);
    }

    init() {
        try {
            if (!this.checkWebGLSupport()) {
                return false;
            }
            
            this.setupCanvas();
            this.initWebGL();
            this.createTextures();
            this.createFramebuffers();
            this.initShaders();
            this.initBackgroundTexture();
            this.setupEventListeners();
            this.startAnimation();
            
            return true;
        } catch (error) {
            return false;
        }
    }

    checkWebGLSupport() {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        
        if (!gl) return false;
        
        // Check for optional extensions
        const floatExt = gl.getExtension('OES_texture_float');
        
        return true;
    }

    setupCanvas() {
        this.canvas = document.createElement('canvas');
        
        // For body element, use viewport dimensions
        if (this.element === document.body) {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            
            const displayValue = this.visible === true ? 'block' : 'none';
            
            this.canvas.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                pointer-events: none;
                z-index: -1;
                opacity: 0.9;
                display: ${displayValue};
            `;
        } else {
            // For other elements, use element dimensions
            const rect = this.element.getBoundingClientRect();
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
            
            const displayValue = this.visible === true ? 'block' : 'none';
            this.canvas.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: -1;
                opacity: 0.9;
                display: ${displayValue};
            `;
            
            // Make element positioned if it's not already
            const computedStyle = getComputedStyle(this.element);
            if (computedStyle.position === 'static') {
                this.element.style.position = 'relative';
            }
        }
        
        this.element.appendChild(this.canvas);
    }

    initWebGL() {
        this.gl = this.canvas.getContext('webgl') || this.canvas.getContext('experimental-webgl');
        
        if (!this.gl) {
            throw new Error('WebGL not supported');
        }

        // Load extensions
        const extensions = [
            'OES_texture_float',
            'OES_texture_half_float',
            'OES_texture_float_linear',
            'OES_texture_half_float_linear'
        ];
        
        extensions.forEach(name => {
            this.gl.getExtension(name);
        });

        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.gl.clearColor(0, 0, 0, 0);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    }

    createTextures() {
        this.textures = [];
        
        for (let i = 0; i < 2; i++) {
            const texture = this.gl.createTexture();
            this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
            
            // Use FLOAT for better precision
            this.gl.texImage2D(
                this.gl.TEXTURE_2D, 0, this.gl.RGBA,
                this.config.resolution, this.config.resolution,
                0, this.gl.RGBA, this.gl.FLOAT, null
            );
            
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
            
            this.textures.push(texture);
        }
    }

    createFramebuffers() {
        this.framebuffers = [];
        
        for (let i = 0; i < 2; i++) {
            const framebuffer = this.gl.createFramebuffer();
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, framebuffer);
            this.gl.framebufferTexture2D(
                this.gl.FRAMEBUFFER,
                this.gl.COLOR_ATTACHMENT0,
                this.gl.TEXTURE_2D,
                this.textures[i],
                0
            );
            this.framebuffers.push(framebuffer);
        }
        
        // Create quad buffer
        this.quad = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quad);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
            -1, -1, 1, -1, 1, 1, -1, 1
        ]), this.gl.STATIC_DRAW);
    }

    compileShader(source, type) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            throw new Error('Shader compile error: ' + this.gl.getShaderInfoLog(shader));
        }
        
        return shader;
    }

    createProgram(vertexSource, fragmentSource) {
        const vertexShader = this.compileShader(vertexSource, this.gl.VERTEX_SHADER);
        const fragmentShader = this.compileShader(fragmentSource, this.gl.FRAGMENT_SHADER);
        
        const program = this.gl.createProgram();
        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);
        
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            throw new Error('Program link error: ' + this.gl.getProgramInfoLog(program));
        }
        
        // Get uniform locations
        const uniforms = {};
        const uniformRegex = /uniform\s+\w+\s+(\w+)/g;
        const shaderCode = vertexSource + fragmentSource;
        let match;
        
        while ((match = uniformRegex.exec(shaderCode)) !== null) {
            const name = match[1];
            uniforms[name] = this.gl.getUniformLocation(program, name);
        }
        
        return { program, uniforms };
    }

    initShaders() {
        const vertexShader = `
            attribute vec2 vertex;
            varying vec2 coord;
            void main() {
                coord = vertex * 0.5 + 0.5;
                gl_Position = vec4(vertex, 0.0, 1.0);
            }
        `;

        // Drop shader - creates initial ripples
        const dropFragmentShader = `
            precision highp float;
            const float PI = 3.141592653589793;
            uniform sampler2D texture;
            uniform vec2 center;
            uniform float radius;
            uniform float strength;
            varying vec2 coord;
            
            void main() {
                vec4 info = texture2D(texture, coord);
                float drop = max(0.0, 1.0 - length(center * 0.5 + 0.5 - coord) / radius);
                drop = 0.5 - cos(drop * PI) * 0.5;
                info.r += drop * strength;
                gl_FragColor = info;
            }
        `;

        // Update shader - realistic water physics based on Shadertoy
        const updateFragmentShader = `
            precision highp float;
            uniform sampler2D texture;
            uniform vec2 delta;
            varying vec2 coord;
            
            const float dampening = 0.995;
            const float springConstant = 0.008;      // Increased for stronger waves
            const float velocityDampening = 0.996;   // Less dampening for longer-lasting waves  
            const float pressureDampening = 0.998;   // Less pressure dampening
            
            void main() {
                vec4 info = texture2D(texture, coord);
                
                float pressure = info.r;
                float velocity = info.g;
                
                // Sample neighboring pixels
                vec2 dx = vec2(delta.x, 0.0);
                vec2 dy = vec2(0.0, delta.y);
                
                float p_right = texture2D(texture, coord + dx).r;
                float p_left = texture2D(texture, coord - dx).r;
                float p_up = texture2D(texture, coord + dy).r;
                float p_down = texture2D(texture, coord - dy).r;
                
                // Handle boundaries (reflective)
                if (coord.x <= delta.x) p_left = p_right;
                if (coord.x >= 1.0 - delta.x) p_right = p_left;
                if (coord.y <= delta.y) p_down = p_up;
                if (coord.y >= 1.0 - delta.y) p_up = p_down;
                
                // Apply wave equation (realistic water physics)
                velocity += (-2.0 * pressure + p_right + p_left) * 0.25;
                velocity += (-2.0 * pressure + p_up + p_down) * 0.25;
                
                // Update pressure
                pressure += velocity;
                
                // Spring motion for realistic waves
                velocity -= springConstant * pressure;
                
                // Apply dampening
                velocity *= velocityDampening;
                pressure *= pressureDampening;
                
                // Store gradients for normal calculation
                float gradX = (p_right - p_left) * 0.5;
                float gradY = (p_up - p_down) * 0.5;
                
                gl_FragColor = vec4(pressure, velocity, gradX, gradY);
            }
        `;

        // Render shader - displays the water surface with lighting
        const renderFragmentShader = `
            precision highp float;
            uniform sampler2D samplerBackground;
            uniform sampler2D samplerRipples;
            uniform float perturbance;
            uniform vec2 delta;
            varying vec2 coord;
            
            void main() {
                vec4 rippleData = texture2D(samplerRipples, coord);
                
                // Use stored gradients for normal calculation
                vec2 normal = vec2(rippleData.z, rippleData.w);
                
                // Calculate refraction offset
                vec2 offset = normal * perturbance;
                
                // Sample background with distortion
                vec4 color = texture2D(samplerBackground, coord + offset);
                
                // Add much stronger white/bright specular highlights for visibility
                vec3 lightDir = normalize(vec3(-0.6, 1.0, 0.3));
                vec3 surfaceNormal = normalize(vec3(-normal.x, 0.15, -normal.y));
                float specular = pow(max(0.0, dot(surfaceNormal, lightDir)), 25.0) * 3.0;
                
                // Add bright white ripple visibility enhancement
                float rippleIntensity = length(normal) * 8.0;
                vec3 brightRipple = vec3(rippleIntensity * 0.8, rippleIntensity * 0.9, rippleIntensity);
                
                // Combine with much brighter white effects
                gl_FragColor = color + vec4(specular + brightRipple.r, specular + brightRipple.g, specular + brightRipple.b, 0.0);
            }
        `;

        // Create programs
        this.programs.drop = this.createProgram(vertexShader, dropFragmentShader);
        this.programs.update = this.createProgram(vertexShader, updateFragmentShader);
        this.programs.render = this.createProgram(vertexShader, renderFragmentShader);
        
        // Set static uniforms
        this.gl.useProgram(this.programs.update.program);
        this.gl.uniform2f(this.programs.update.uniforms.delta, 
            1.0 / this.config.resolution, 1.0 / this.config.resolution);
    }

    initBackgroundTexture() {
        this.backgroundTexture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.backgroundTexture);
        
        // Create realistic ocean gradient background
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        
        // Deep ocean gradient - from depths to surface
        const gradient = ctx.createLinearGradient(0, 0, 0, 256);
        gradient.addColorStop(0, '#0a1728');    // Deep ocean
        gradient.addColorStop(0.2, '#0f2847');  // Mid depth
        gradient.addColorStop(0.5, '#1e3a8a');  // Ocean surface
        gradient.addColorStop(0.8, '#0f2847');  // Back to mid depth
        gradient.addColorStop(1, '#0a1728');    // Deep again
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 256, 256);
        
        // Add ocean sparkles and light rays
        ctx.globalCompositeOperation = 'screen';
        for (let i = 0; i < 800; i++) {
            const x = Math.random() * 256;
            const y = Math.random() * 256;
            const alpha = Math.random() * 0.15;
            const blue = Math.random() > 0.7 ? '14, 165, 233' : '59, 130, 246'; // Ocean blues
            ctx.fillStyle = `rgba(${blue}, ${alpha})`;
            ctx.fillRect(x, y, 1, 1);
        }
        
        // Add some light streaks
        ctx.globalCompositeOperation = 'overlay';
        for (let i = 0; i < 5; i++) {
            const x = Math.random() * 256;
            const lightGradient = ctx.createLinearGradient(x, 0, x, 256);
            lightGradient.addColorStop(0, 'rgba(186, 230, 253, 0.1)');
            lightGradient.addColorStop(0.5, 'rgba(125, 211, 252, 0.05)');
            lightGradient.addColorStop(1, 'transparent');
            ctx.fillStyle = lightGradient;
            ctx.fillRect(x - 2, 0, 4, 256);
        }
        
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, canvas);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.REPEAT);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.REPEAT);
    }

    setupEventListeners() {
        if (!this.config.interactive) return;
        
        // Mouse events
        this.element.addEventListener('mousemove', this.handlePointerEvent);
        this.element.addEventListener('click', this.handlePointerEvent);
        
        // Touch events
        this.element.addEventListener('touchstart', this.handlePointerEvent);
        this.element.addEventListener('touchmove', this.handlePointerEvent);
        
        // Resize handling
        window.addEventListener('resize', this.handleResize);
    }

    handlePointerEvent(e) {
        // Early return if destroyed or canvas is null
        if (this.destroyed || !this.canvas) {
            return;
        }
        
        e.preventDefault();
        
        let clientX, clientY;
        
        if (e.type.startsWith('touch')) {
            const touch = e.changedTouches[0];
            clientX = touch.clientX;
            clientY = touch.clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        
        // For body element with fixed canvas, use direct page coordinates
        let x, y;
        if (this.element === document.body) {
            x = clientX;
            y = clientY;
        } else {
            // For other elements, use relative positioning
            const canvasRect = this.canvas.getBoundingClientRect();
            x = clientX - canvasRect.left;
            y = clientY - canvasRect.top;
        }
        
        
        const strength = (e.type === 'click' || e.type === 'touchstart') ? 0.15 : 0.05;
        this.drop(x, y, this.config.dropRadius, strength);
    }

    handleResize() {
        // Early return if destroyed or canvas is null
        if (this.destroyed || !this.canvas || !this.gl) {
            return;
        }
        
        if (this.element === document.body) {
            // For body, use viewport dimensions
            if (window.innerWidth !== this.canvas.width || window.innerHeight !== this.canvas.height) {
                this.canvas.width = window.innerWidth;
                this.canvas.height = window.innerHeight;
                this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
            }
        } else {
            // For other elements, use element dimensions
            const rect = this.element.getBoundingClientRect();
            if (rect.width !== this.canvas.width || rect.height !== this.canvas.height) {
                this.canvas.width = rect.width;
                this.canvas.height = rect.height;
                this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
            }
        }
    }

    drop(x, y, radius, strength) {
        // Early return if destroyed or canvas is null
        if (this.destroyed || !this.canvas || !this.gl) {
            return;
        }
        
        // Use proper aspect ratio-aware coordinate transformation
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        
        // Normalize radius based on the smaller dimension for consistent sizing
        const smallerSide = Math.min(canvasWidth, canvasHeight);
        const dropRadius = radius / smallerSide;
        
        // Convert screen coordinates to normalized device coordinates [-1, 1]
        // X: left edge = -1, right edge = 1
        // Y: bottom edge = -1, top edge = 1 (flipped for WebGL)
        const dropPosition = [
            (2 * x / canvasWidth) - 1,
            1 - (2 * y / canvasHeight)  // Flip Y coordinate for WebGL
        ];
        
        // Render drop
        this.gl.viewport(0, 0, this.config.resolution, this.config.resolution);
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffers[this.bufferWriteIndex]);
        
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures[this.bufferReadIndex]);
        
        this.gl.useProgram(this.programs.drop.program);
        this.gl.uniform2fv(this.programs.drop.uniforms.center, dropPosition);
        this.gl.uniform1f(this.programs.drop.uniforms.radius, dropRadius);
        this.gl.uniform1f(this.programs.drop.uniforms.strength, strength);
        this.gl.uniform1i(this.programs.drop.uniforms.texture, 0);
        
        this.drawQuad();
        this.swapBuffers();
    }

    update() {
        if (this.destroyed || !this.gl) return;
        
        this.gl.viewport(0, 0, this.config.resolution, this.config.resolution);
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffers[this.bufferWriteIndex]);
        
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures[this.bufferReadIndex]);
        
        this.gl.useProgram(this.programs.update.program);
        this.gl.uniform1i(this.programs.update.uniforms.texture, 0);
        
        this.drawQuad();
        this.swapBuffers();
    }

    render() {
        if (this.destroyed || !this.gl || !this.canvas) return;
        
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.gl.enable(this.gl.BLEND);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        
        this.gl.useProgram(this.programs.render.program);
        
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.backgroundTexture);
        this.gl.activeTexture(this.gl.TEXTURE1);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.textures[this.bufferReadIndex]);
        
        this.gl.uniform1i(this.programs.render.uniforms.samplerBackground, 0);
        this.gl.uniform1i(this.programs.render.uniforms.samplerRipples, 1);
        this.gl.uniform1f(this.programs.render.uniforms.perturbance, this.config.perturbance);
        
        this.drawQuad();
        this.gl.disable(this.gl.BLEND);
    }

    drawQuad() {
        if (this.destroyed || !this.gl || !this.quad) return;
        
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quad);
        this.gl.vertexAttribPointer(0, 2, this.gl.FLOAT, false, 0, 0);
        this.gl.enableVertexAttribArray(0);
        this.gl.drawArrays(this.gl.TRIANGLE_FAN, 0, 4);
    }

    swapBuffers() {
        this.bufferWriteIndex = 1 - this.bufferWriteIndex;
        this.bufferReadIndex = 1 - this.bufferReadIndex;
    }

    step() {
        if (this.destroyed) return;
        
        if (this.running) {
            this.update();
        }
        
        if (this.visible) {
            this.render();
        }
        
        requestAnimationFrame(this.step);
    }

    startAnimation() {
        this.step();
    }

    // Public API
    show() {
        this.visible = true;
        this.canvas.style.display = 'block';
    }

    hide() {
        this.visible = false;
        this.canvas.style.display = 'none';
    }

    pause() {
        this.running = false;
    }

    play() {
        this.running = true;
    }

    destroy() {
        this.destroyed = true;
        
        // Remove event listeners to prevent memory leaks and errors
        if (this.config.interactive && this.element) {
            this.element.removeEventListener('mousemove', this.handlePointerEvent);
            this.element.removeEventListener('click', this.handlePointerEvent);
            this.element.removeEventListener('touchstart', this.handlePointerEvent);
            this.element.removeEventListener('touchmove', this.handlePointerEvent);
        }
        window.removeEventListener('resize', this.handleResize);
        
        // Remove canvas from DOM
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        
        // Clean up WebGL resources thoroughly
        if (this.gl) {
            // Delete textures
            this.textures.forEach(texture => {
                if (texture) this.gl.deleteTexture(texture);
            });
            
            // Delete framebuffers
            this.framebuffers.forEach(fb => {
                if (fb) this.gl.deleteFramebuffer(fb);
            });
            
            // Delete buffers
            if (this.quad) this.gl.deleteBuffer(this.quad);
            if (this.backgroundTexture) this.gl.deleteTexture(this.backgroundTexture);
            
            // Delete shader programs
            Object.values(this.programs).forEach(program => {
                if (program && program.program) {
                    this.gl.deleteProgram(program.program);
                }
            });
        }
        
        // Clear all references
        this.canvas = null;
        this.gl = null;
        this.textures = [];
        this.framebuffers = [];
        this.programs = {};
        this.quad = null;
        this.backgroundTexture = null;
    }

    static create(element, options = {}) {
        return new RealisticWaterRipples(element, options);
    }
}

// Export for module use
export default RealisticWaterRipples;

// Make available globally
if (typeof window !== 'undefined') {
    window.RealisticWaterRipples = RealisticWaterRipples;
}