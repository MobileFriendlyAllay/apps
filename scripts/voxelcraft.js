        const BLOCK_TYPES = { grass: 0x4CAF50, dirt: 0x795548, stone: 0x9E9E9E, wood: 0x5D4037, leaves: 0x2E7D32 };
        let scene, camera, renderer, clock;
        let voxels = new Map(); 
        
        let player = { 
            velocity: new THREE.Vector3(), 
            onGround: false, 
            baseSpeed: 0.12, 
            crouchSpeed: 0.05,
            jumpForce: 0.22, 
            height: 1.7, 
            crouchHeight: 1.3,
            radius: 0.3
        };

        let controls = { forward: false, backward: false, left: false, right: false, jump: false, crouch: false };
        let selectedIndex = 0;
        let selectedBlock = 'grass';
        let isPaused = true;
        let labelTimeout;
        let frustum = new THREE.Frustum();
        let projScreenMatrix = new THREE.Matrix4();
        let renderDistance = 35;

        window.onload = () => { init(); animate(); setupMenu(); selectSlot(0); };

        function init() {
            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x87CEEB); 
            
            camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 250);
            camera.position.set(5, 15, 5);
            camera.rotation.order = "YXZ";
            
            renderer = new THREE.WebGLRenderer({ antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            document.body.appendChild(renderer.domElement);
            
            scene.add(new THREE.AmbientLight(0xffffff, 0.7));
            const sun = new THREE.DirectionalLight(0xffffff, 0.6);
            sun.position.set(20, 40, 20);
            scene.add(sun);
            
            clock = new THREE.Clock();
            generateWorld();
            setupControls();
            updateRenderDistance(35);

            // Frequent but lightweight culling updates
            setInterval(updateFrustumCulling, 100);
        }

        function updateRenderDistance(dist) {
            renderDistance = parseInt(dist);
            camera.far = renderDistance + 50;
            camera.updateProjectionMatrix();
            scene.fog = new THREE.Fog(0x87CEEB, renderDistance - 10, renderDistance + 10);
            document.getElementById('render-val').innerText = `${renderDistance} Blocks`;
            updateFrustumCulling();
        }

        function generateWorld(customData = null) {
            voxels.forEach(v => { if(v.mesh) scene.remove(v.mesh); });
            voxels.clear();
            
            if (customData) {
                customData.forEach(block => { addVoxelData(block.x, block.y, block.z, block.type); });
            } else {
                const size = 35; // Slightly reduced world size for faster initial load
                for (let x = -size; x < size; x++) {
                    for (let z = -size; z < size; z++) {
                        const h = Math.floor(Math.sin(x * 0.15) * 3 + Math.cos(z * 0.15) * 3 + 6);
                        for (let y = 0; y <= h; y++) {
                            addVoxelData(x, y, z, y === h ? 'grass' : (y > h-3 ? 'dirt' : 'stone'));
                        }
                        if (Math.random() > 0.988) spawnTree(x, h + 1, z);
                    }
                }
            }
            // Initial render: show only visible blocks
            voxels.forEach((v, key) => refreshVoxelVisibility(key));
        }

        function spawnTree(x, y, z) {
            const trunkHeight = 4 + Math.floor(Math.random() * 2);
            for (let i = 0; i < trunkHeight; i++) addVoxelData(x, y + i, z, 'wood');
            for (let lx = -2; lx <= 2; lx++) {
                for (let lz = -2; lz <= 2; lz++) {
                    for (let ly = 0; ly <= 2; ly++) {
                        if (Math.abs(lx) + Math.abs(lz) + Math.abs(ly-1) < 4) {
                            addVoxelData(x + lx, y + trunkHeight + ly - 1, z + lz, 'leaves');
                        }
                    }
                }
            }
        }

        function addVoxelData(x, y, z, type) {
            const key = `${x},${y},${z}`;
            if (!voxels.has(key)) voxels.set(key, { type, mesh: null });
        }

        function addVoxel(x, y, z, type) {
            const key = `${x},${y},${z}`;
            if (voxels.has(key)) return;
            voxels.set(key, { type, mesh: null });
            
            // Optimization: Only update this block and neighbors
            refreshVoxelVisibility(key);
            getNeighbors(x,y,z).forEach(n => refreshVoxelVisibility(n));
        }

        function removeVoxel(x, y, z) {
            const key = `${x},${y},${z}`;
            if (voxels.has(key)) {
                if (voxels.get(key).mesh) scene.remove(voxels.get(key).mesh);
                voxels.delete(key);
                // Optimization: Only update neighbors
                getNeighbors(x,y,z).forEach(n => refreshVoxelVisibility(n));
            }
        }

        function getNeighbors(x, y, z) {
            return [`${x+1},${y},${z}`, `${x-1},${y},${z}`, `${x},${y+1},${z}`, `${x},${y-1},${z}`, `${x},${y},${z+1}`, `${x},${y},${z-1}` ];
        }

        const boxGeo = new THREE.BoxGeometry(1, 1, 1);
        function refreshVoxelVisibility(key) {
            const voxel = voxels.get(key);
            if (!voxel) return;
            const parts = key.split(',');
            const x = Number(parts[0]), y = Number(parts[1]), z = Number(parts[2]);
            
            // A voxel is hidden if all 6 faces are covered by other voxels
            const isHidden = getNeighbors(x,y,z).every(n => voxels.has(n));
            
            if (isHidden) {
                if (voxel.mesh) { scene.remove(voxel.mesh); voxel.mesh = null; }
            } else if (!voxel.mesh) {
                const mesh = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: BLOCK_TYPES[voxel.type] }));
                mesh.position.set(x, y, z);
                scene.add(mesh);
                voxel.mesh = mesh;
            }
        }

        function updateFrustumCulling() {
            camera.updateMatrixWorld();
            projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
            frustum.setFromProjectionMatrix(projScreenMatrix);
            
            voxels.forEach((v) => {
                if (v.mesh) {
                    // Quick check distance then frustum
                    const distSq = v.mesh.position.distanceToSquared(camera.position);
                    if (distSq > renderDistance * renderDistance) {
                        v.mesh.visible = false;
                    } else {
                        v.mesh.visible = frustum.intersectsObject(v.mesh);
                    }
                }
            });
        }

        function setupControls() {
            renderer.domElement.addEventListener('click', () => { if (isPaused) renderer.domElement.requestPointerLock(); });
            
            window.addEventListener('wheel', (e) => {
                if (isPaused) return;
                if (e.deltaY > 0) selectedIndex = (selectedIndex + 1) % 5;
                else selectedIndex = (selectedIndex - 1 + 5) % 5;
                selectSlot(selectedIndex);
            }, { passive: true });

            document.addEventListener('keydown', (e) => {
                if (e.code === 'KeyW') controls.forward = true;
                if (e.code === 'KeyS') controls.backward = true;
                if (e.code === 'KeyA') controls.left = true;
                if (e.code === 'KeyD') controls.right = true;
                if (e.code === 'Space') controls.jump = true;
                if (e.code === 'ShiftLeft') controls.crouch = true;
                if (e.key >= '1' && e.key <= '5') {
                    selectedIndex = parseInt(e.key) - 1;
                    selectSlot(selectedIndex);
                }
            });
            document.addEventListener('keyup', (e) => {
                if (e.code === 'KeyW') controls.forward = false;
                if (e.code === 'KeyS') controls.backward = false;
                if (e.code === 'KeyA') controls.left = false;
                if (e.code === 'KeyD') controls.right = false;
                if (e.code === 'Space') controls.jump = false;
                if (e.code === 'ShiftLeft') controls.crouch = false;
            });
            document.addEventListener('mousedown', (e) => {
                if (isPaused) return;
                const ray = new THREE.Raycaster();
                ray.setFromCamera(new THREE.Vector2(0,0), camera);
                const active = []; 
                voxels.forEach(v => { if(v.mesh && v.mesh.visible) active.push(v.mesh); });
                const hit = ray.intersectObjects(active)[0];
                if (hit) {
                    if (e.button === 0) removeVoxel(hit.object.position.x, hit.object.position.y, hit.object.position.z);
                    else if (e.button === 2) {
                        const p = hit.object.position.clone().add(hit.face.normal);
                        addVoxel(Math.round(p.x), Math.round(p.y), Math.round(p.z), selectedBlock);
                    }
                }
            });
            document.addEventListener('pointerlockchange', () => {
                isPaused = document.pointerLockElement !== renderer.domElement;
                document.getElementById('pause-menu').classList.toggle('hidden', !isPaused);
            });
            document.addEventListener('mousemove', (e) => {
                if (isPaused) return;
                camera.rotation.y -= e.movementX * 0.002;
                camera.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, camera.rotation.x - e.movementY * 0.002));
            });
        }

        function selectSlot(idx) {
            const slots = ['grass', 'dirt', 'stone', 'wood', 'leaves'];
            selectedIndex = idx;
            selectedBlock = slots[idx];
            document.querySelectorAll('.hotbar-slot').forEach((s, i) => s.classList.toggle('selected', i === idx));
            const label = document.getElementById('item-label');
            label.innerText = selectedBlock.charAt(0).toUpperCase() + selectedBlock.slice(1);
            label.style.opacity = '1';
            clearTimeout(labelTimeout);
            labelTimeout = setTimeout(() => label.style.opacity = '0', 1000);
        }

        function checkCollision(pos) {
            const r = player.radius;
            const h = controls.crouch ? player.crouchHeight : player.height;
            for (let yOffset = -h; yOffset <= 0.2; yOffset += 0.5) {
                for (let xOffset = -r; xOffset <= r; xOffset += r*2) {
                    for (let zOffset = -r; zOffset <= r; zOffset += r*2) {
                        const nx = Math.round(pos.x + xOffset);
                        const ny = Math.round(pos.y + yOffset);
                        const nz = Math.round(pos.z + zOffset);
                        if (voxels.has(`${nx},${ny},${nz}`)) return true;
                    }
                }
            }
            return false;
        }

        function isHeadHittingCeiling(pos) {
            const r = player.radius;
            const headY = Math.round(pos.y + 0.1);
            for (let xOffset = -r; xOffset <= r; xOffset += r*2) {
                for (let zOffset = -r; zOffset <= r; zOffset += r*2) {
                    const nx = Math.round(pos.x + xOffset);
                    const nz = Math.round(pos.z + zOffset);
                    if (voxels.has(`${nx},${headY},${nz}`)) return true;
                }
            }
            return false;
        }

        function isGroundUnder(pos) {
            const r = player.radius;
            const h = controls.crouch ? player.crouchHeight : player.height;
            const ny = Math.round(pos.y - h - 0.1); 
            for (let xOffset = -r; xOffset <= r; xOffset += r*2) {
                for (let zOffset = -r; zOffset <= r; zOffset += r*2) {
                    const nx = Math.round(pos.x + xOffset);
                    const nz = Math.round(pos.z + zOffset);
                    if (voxels.has(`${nx},${ny},${nz}`)) return true;
                }
            }
            return false;
        }

        function updatePhysics() {
            const speed = controls.crouch ? player.crouchSpeed : player.baseSpeed;
            const moveDir = new THREE.Vector3();
            if (controls.forward) moveDir.z -= 1;
            if (controls.backward) moveDir.z += 1;
            if (controls.left) moveDir.x -= 1;
            if (controls.right) moveDir.x += 1;
            
            if (moveDir.length() > 0) {
                moveDir.normalize().applyAxisAngle(new THREE.Vector3(0,1,0), camera.rotation.y);
            }

            player.velocity.y -= 0.012;
            
            const nextX = camera.position.clone();
            nextX.x += moveDir.x * speed;
            if (!checkCollision(nextX)) {
                if (!(controls.crouch && player.onGround && !isGroundUnder(nextX))) {
                    camera.position.x = nextX.x;
                }
            }
            
            const nextZ = camera.position.clone();
            nextZ.z += moveDir.z * speed;
            if (!checkCollision(nextZ)) {
                if (!(controls.crouch && player.onGround && !isGroundUnder(nextZ))) {
                    camera.position.z = nextZ.z;
                }
            }

            camera.position.y += player.velocity.y;
            
            if (player.velocity.y > 0 && isHeadHittingCeiling(camera.position)) {
                player.velocity.y = 0;
                const ceilY = Math.round(camera.position.y + 0.1);
                camera.position.y = ceilY - 1.1; 
            }

            if (checkCollision(camera.position)) {
                if (player.velocity.y < 0) {
                    player.onGround = true;
                    camera.position.y = Math.round(camera.position.y - (controls.crouch ? player.crouchHeight : player.height)) + (controls.crouch ? player.crouchHeight : player.height) + 0.51;
                }
                player.velocity.y = 0;
            } else {
                player.onGround = false;
            }

            if (controls.jump && player.onGround) {
                player.velocity.y = player.jumpForce;
                player.onGround = false;
            }

            if (camera.position.y < -10) camera.position.set(5, 15, 5);
        }

        function animate() {
            requestAnimationFrame(animate);
            if (!isPaused) updatePhysics();
            renderer.render(scene, camera);
            const delta = clock.getDelta();
            if (Math.random() > 0.9) document.getElementById('fps-counter').innerText = `FPS: ${Math.round(1/delta)}`;
        }

        function setupMenu() {
            document.getElementById('resume-btn').onclick = () => renderer.domElement.requestPointerLock();
            
            document.getElementById('render-slider').oninput = (e) => {
                updateRenderDistance(e.target.value);
            };

            document.getElementById('export-btn').onclick = () => {
                const data = [];
                voxels.forEach((v, k) => { const parts=k.split(','); data.push({x:Number(parts[0]),y:Number(parts[1]),z:Number(parts[2]),type:v.type}); });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], {type:'application/json'}));
                a.download = 'world.json'; a.click();
            };
            document.getElementById('import-input').onchange = (e) => {
                const reader = new FileReader();
                reader.onload = (ev) => { generateWorld(JSON.parse(ev.target.result)); document.getElementById('resume-btn').click(); };
                reader.readAsText(e.target.files[0]);
            };
        }

        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });
